<template>
  <div class="app-container">
    <!-- 查询 -->
    <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch" label-width="80px">
      <el-form-item label="商户号" prop="id">
        <el-input v-model="queryParams.id" placeholder="请输入商户号" clearable @keyup.enter.native="handleQuery" />
      </el-form-item>
      <el-form-item label="商户名称" prop="name">
        <el-input v-model="queryParams.name" placeholder="请输入商户名称" clearable @keyup.enter.native="handleQuery" />
      </el-form-item>
      <el-form-item label="状态" prop="enabled">
        <el-select v-model="queryParams.enabled" placeholder="全部" clearable>
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">搜索</el-button>
        <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="el-icon-plus" size="mini" @click="handleAdd">新建商户</el-button>
      </el-col>
      <right-toolbar :showSearch.sync="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table v-loading="loading" :data="merchantList">
      <el-table-column label="商户号" align="center" prop="id" width="150" />
      <el-table-column label="商户名称" align="center" prop="name" :show-overflow-tooltip="true" />
      <el-table-column label="环境" align="center" prop="env" width="90">
        <template slot-scope="scope">
          <el-tag :type="scope.row.env === 'prod' ? 'danger' : 'warning'" size="mini">{{ scope.row.env }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="密钥" align="center" prop="secretKey" width="180" />
      <el-table-column label="启动地址" align="center" prop="launchBaseUrl" :show-overflow-tooltip="true" />
      <el-table-column label="启动参数" align="center" prop="launchParam" width="100" />
      <el-table-column label="IP 白名单" align="center" prop="ipWhitelist" :show-overflow-tooltip="true" />
      <el-table-column label="状态" align="center" prop="enabled" width="90">
        <template slot-scope="scope">
          <el-tag :type="scope.row.enabled === 1 ? 'success' : 'info'" size="mini">
            {{ scope.row.enabled === 1 ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" align="center" prop="createTime" width="160" />
      <el-table-column label="操作" align="center" width="300" class-name="small-padding fixed-width">
        <template slot-scope="scope">
          <el-button size="mini" type="text" icon="el-icon-edit" @click="handleUpdate(scope.row)">修改</el-button>
          <el-button size="mini" type="text" icon="el-icon-key" @click="handleResetKey(scope.row)">重置密钥</el-button>
          <el-button size="mini" type="text" icon="el-icon-user" @click="handlePlayers(scope.row)">玩家</el-button>
          <el-button size="mini" type="text" icon="el-icon-tickets" @click="handleTxns(scope.row)">流水</el-button>
          <el-button size="mini" type="text" :icon="scope.row.enabled === 1 ? 'el-icon-turn-off' : 'el-icon-open'"
                     @click="handleToggle(scope.row)">{{ scope.row.enabled === 1 ? '停用' : '启用' }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <pagination v-show="total > 0" :total="total" :page.sync="queryParams.pageNum"
                :limit.sync="queryParams.pageSize" @pagination="getList" />

    <!-- 新建 / 修改 -->
    <el-dialog :title="formTitle" :visible.sync="formOpen" width="560px" append-to-body>
      <el-form ref="form" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="商户名称" prop="name">
          <el-input v-model="form.name" placeholder="例如 gamingclub" />
        </el-form-item>
        <el-form-item label="环境" prop="env">
          <el-select v-model="form.env">
            <el-option label="生产 prod" value="prod" />
            <el-option label="测试 test" value="test" />
          </el-select>
        </el-form-item>
        <el-form-item label="启动地址" prop="launchBaseUrl">
          <el-input v-model="form.launchBaseUrl" placeholder="厂商 H5 地址，例如 https://h5.example.com/" />
        </el-form-item>
        <el-form-item label="启动参数" prop="launchParam">
          <el-select v-model="form.launchParam">
            <el-option label="userData（AES 免登录）" value="userData" />
            <el-option label="token（JWT）" value="token" />
          </el-select>
        </el-form-item>
        <el-form-item label="IP 白名单" prop="ipWhitelist">
          <el-input type="textarea" :rows="2" v-model="form.ipWhitelist" placeholder="逗号分隔，留空表示不限制" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input type="textarea" :rows="2" v-model="form.remark" />
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button type="primary" @click="submitForm">确 定</el-button>
        <el-button @click="formOpen = false">取 消</el-button>
      </div>
    </el-dialog>

    <!-- 密钥只显示一次 -->
    <el-dialog title="请立即保存密钥" :visible.sync="secretOpen" width="620px" append-to-body :close-on-click-modal="false">
      <el-alert type="warning" :closable="false" show-icon
                title="密钥只在此处显示一次，关闭后无法再次查看；平台侧配置完成后请妥善保管。"
                style="margin-bottom: 12px" />
      <el-form label-width="110px">
        <el-form-item label="商户号">
          <el-input :value="secretInfo.id" readonly />
        </el-form-item>
        <el-form-item label="密钥">
          <el-input :value="secretInfo.secretKey" readonly />
        </el-form-item>
        <el-form-item label="旧密钥并行至" v-if="secretInfo.prevExpireAt">
          <el-input :value="secretInfo.prevExpireAt" readonly />
        </el-form-item>
      </el-form>
      <div slot="footer">
        <el-button type="primary" @click="copySecret">复制密钥</el-button>
        <el-button @click="secretOpen = false">我已保存</el-button>
      </div>
    </el-dialog>

    <!-- 玩家 / 流水 -->
    <el-dialog :title="subTitle" :visible.sync="subOpen" width="820px" append-to-body>
      <el-table :data="subList" v-loading="subLoading" max-height="420">
        <el-table-column v-for="col in subColumns" :key="col.prop" :label="col.label" :prop="col.prop"
                         align="center" :width="col.width" />
      </el-table>
      <pagination v-show="subTotal > 0" :total="subTotal" :page.sync="subQuery.pageNum"
                  :limit.sync="subQuery.pageSize" @pagination="loadSub" />
    </el-dialog>
  </div>
</template>

<script>
import {
  listMerchant, createMerchant, updateMerchant, enableMerchant,
  resetMerchantKey, listMerchantPlayers, listMerchantTxns
} from '@/api/niuma/merchant';

export default {
  name: 'NiumaMerchant',
  data() {
    return {
      loading: false,
      showSearch: true,
      merchantList: [],
      total: 0,
      queryParams: { pageNum: 1, pageSize: 10, id: undefined, name: undefined, enabled: undefined },

      formOpen: false,
      formTitle: '新建商户',
      form: { id: undefined, name: undefined, env: 'test', launchBaseUrl: '', launchParam: 'userData', ipWhitelist: '', remark: '' },
      rules: {
        name: [{ required: true, message: '商户名称不能为空', trigger: 'blur' }],
        env: [{ required: true, message: '请选择环境', trigger: 'change' }]
      },

      secretOpen: false,
      secretInfo: { id: '', secretKey: '', prevExpireAt: null },

      subOpen: false,
      subTitle: '',
      subLoading: false,
      subList: [],
      subTotal: 0,
      subColumns: [],
      subQuery: { pageNum: 1, pageSize: 10 },
      subMerchantId: null,
      subType: 'players'
    };
  },
  created() {
    this.getList();
  },
  methods: {
    getList() {
      this.loading = true;
      listMerchant(this.queryParams).then(res => {
        this.merchantList = res.records || [];
        this.total = res.total || 0;
        this.loading = false;
      }).catch(() => { this.loading = false; });
    },
    handleQuery() {
      this.queryParams.pageNum = 1;
      this.getList();
    },
    resetQuery() {
      this.queryParams = { pageNum: 1, pageSize: 10 };
      this.getList();
    },
    handleAdd() {
      this.formTitle = '新建商户';
      this.form = { id: undefined, name: undefined, env: 'test', launchBaseUrl: '', launchParam: 'userData', ipWhitelist: '', remark: '' };
      this.formOpen = true;
    },
    handleUpdate(row) {
      this.formTitle = '修改商户';
      this.form = { ...row };
      this.formOpen = true;
    },
    submitForm() {
      this.$refs.form.validate(valid => {
        if (!valid) return;
        const call = this.form.id ? updateMerchant(this.form) : createMerchant(this.form);
        call.then(res => {
          this.$modal.msgSuccess('操作成功');
          this.formOpen = false;
          this.getList();
          // 新建成功后展示一次明文密钥
          const data = res && res.data ? res.data : null;
          if (data && data.secretKey) {
            this.secretInfo = { id: data.id, secretKey: data.secretKey, prevExpireAt: null };
            this.secretOpen = true;
          }
        });
      });
    },
    handleToggle(row) {
      const target = row.enabled === 1 ? 0 : 1;
      enableMerchant(row.id, target).then(() => {
        this.$modal.msgSuccess(target === 1 ? '已启用' : '已停用');
        this.getList();
      });
    },
    handleResetKey(row) {
      this.$modal.confirm('重置后旧密钥仍可并行 7 天，确认重置商户「' + row.name + '」的密钥？').then(() => {
        return resetMerchantKey(row.id, 7);
      }).then(res => {
        const data = res && res.data ? res.data : {};
        this.secretInfo = { id: data.id || row.id, secretKey: data.secretKey, prevExpireAt: data.prevExpireAt };
        this.secretOpen = true;
        this.getList();
      }).catch(() => {});
    },
    copySecret() {
      const text = this.secretInfo.secretKey || '';
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.$modal.msgSuccess('已复制到剪贴板');
    },
    handlePlayers(row) {
      this.subType = 'players';
      this.subTitle = '商户玩家 - ' + row.name;
      this.subMerchantId = row.id;
      this.subColumns = [
        { label: '平台玩家ID', prop: 'playerId' },
        { label: 'NiuMa 玩家ID', prop: 'vendorPlayerId' },
        { label: '昵称', prop: 'nickname' },
        { label: '绑定时间', prop: 'createTime', width: 170 }
      ];
      this.subQuery = { pageNum: 1, pageSize: 10 };
      this.subOpen = true;
      this.loadSub();
    },
    handleTxns(row) {
      this.subType = 'txns';
      this.subTitle = '商户流水 - ' + row.name;
      this.subMerchantId = row.id;
      this.subColumns = [
        { label: '平台流水号', prop: 'txnId', width: 200 },
        { label: '玩家', prop: 'playerId' },
        { label: '类型', prop: 'type', width: 80 },
        { label: '金额', prop: 'amount', width: 100 },
        { label: '余额', prop: 'balanceAfter', width: 100 },
        { label: '时间', prop: 'createTime', width: 170 }
      ];
      this.subQuery = { pageNum: 1, pageSize: 10 };
      this.subOpen = true;
      this.loadSub();
    },
    loadSub() {
      if (!this.subMerchantId) return;
      this.subLoading = true;
      const call = this.subType === 'players'
        ? listMerchantPlayers(this.subMerchantId, this.subQuery)
        : listMerchantTxns(this.subMerchantId, this.subQuery);
      call.then(res => {
        this.subList = res.records || [];
        this.subTotal = res.total || 0;
        this.subLoading = false;
      }).catch(() => { this.subLoading = false; });
    }
  }
};
</script>
