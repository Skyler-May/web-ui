<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch" label-width="80px">
      <el-form-item label="房间ID" prop="venueId">
        <el-input v-model="queryParams.venueId" placeholder="请输入房间ID" clearable @keyup.enter.native="handleQuery" />
      </el-form-item>
      <el-form-item label="房主ID" prop="ownerId">
        <el-input v-model="queryParams.ownerId" placeholder="请输入房主ID" clearable @keyup.enter.native="handleQuery" />
      </el-form-item>
      <el-form-item label="房间编号" prop="number">
        <el-input v-model="queryParams.number" placeholder="请输入房间编号" clearable @keyup.enter.native="handleQuery" />
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="dateRange"
          style="width: 240px"
          value-format="yyyy-MM-dd HH:mm:ss"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        ></el-date-picker>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">搜索</el-button>
        <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="roomList">
      <el-table-column label="房间ID" align="center" prop="venueId" />
      <el-table-column label="房主ID" align="center" prop="ownerId" />
      <el-table-column label="房主昵称" align="center" prop="ownerName" />
      <el-table-column label="房间编号" align="center" prop="number" />
      <el-table-column label="底注" align="center" prop="diZhu" />
      <el-table-column label="状态" align="center" width="100">
        <template slot-scope="scope">
          <span>{{ getStatus(scope.row.status) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" align="center" prop="createTime" />
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      :page.sync="queryParams.pageNum"
      :limit.sync="queryParams.pageSize"
      @pagination="getList"
    />
  </div>
</template>

<script>
import { listPaoDeKuai } from "@/api/niuma/game";

export default {
  name: "PaoDeKuai",
  data() {
    return {
      loading: false,
      showSearch: true,
      dateRange: [],
      total: 0,
      roomList: [],
      queryParams: {
        venueId: null,
        ownerId: null,
        number: null,
        createTimeStart: null,
        createTimeEnd: null,
        pageNum: 1,
        pageSize: 10
      }
    };
  },
  created() {
    this.getList();
  },
  methods: {
    getList() {
      this.loading = true;
      const params = { ...this.queryParams };
      if (this.dateRange && this.dateRange.length === 2) {
        params.createTimeStart = this.dateRange[0];
        params.createTimeEnd = this.dateRange[1];
      }
      listPaoDeKuai(params)
        .then((response) => {
          this.roomList = response.records || [];
          this.total = response.total || 0;
        })
        .finally(() => {
          this.loading = false;
        });
    },
    handleQuery() {
      this.queryParams.pageNum = 1;
      this.getList();
    },
    resetQuery() {
      this.dateRange = [];
      this.queryParams = {
        venueId: null,
        ownerId: null,
        number: null,
        createTimeStart: null,
        createTimeEnd: null,
        pageNum: 1,
        pageSize: 10
      };
      this.getList();
    },
    getStatus(status) {
      const map = { 0: "正常", 1: "游戏中", 2: "已结束" };
      return map[status] === undefined ? "-" : map[status];
    }
  }
};
</script>
