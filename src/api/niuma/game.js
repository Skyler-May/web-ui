import request from '@/utils/request';
import { parseStrEmpty } from "@/utils/ruoyi";

// 查询麻将房间列表
export function listMahjong(data) {
  return request({
    url: '/admin/mahjong/page',
    method: 'post',
    data: data
  });
}

// 查询比鸡房间列表
export function listBiJi(data) {
  return request({
    url: '/admin/bi-ji/page',
    method: 'post',
    data: data
  });
}

// 查询逮狗腿房间列表
export function listLackey(data) {
  return request({
    url: '/admin/lackey/page',
    method: 'post',
    data: data
  });
}

// 查询百人牛牛房间列表
export function listNiu100(data) {
  return request({
    url: '/admin/niu100/page',
    method: 'post',
    data: data
  });
}
// 查询斗地主房间列表
export function listLandlord(data) {
  return request({
    url: '/admin/landlord/page',
    method: 'post',
    data: data
  });
}

// 查询跑得快房间列表
export function listPaoDeKuai(data) {
  return request({
    url: '/admin/pao-de-kuai/page',
    method: 'post',
    data: data
  });
}

// 查询经典牛牛房间列表
export function listNiuNiu(data) {
  return request({
    url: '/admin/niu-niu/page',
    method: 'post',
    data: data
  });
}

// 查询浙江麻将房间列表
export function listZhejiangMahjong(data) {
  return request({
    url: '/admin/zhejiang-mahjong/page',
    method: 'post',
    data: data
  });
}
