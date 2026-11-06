import request from '@/utils/request';

// 商户列表（分页）
export function listMerchant(data) {
  return request({
    url: '/admin/merchant/page',
    method: 'post',
    data: data
  });
}

// 商户详情
export function getMerchant(id) {
  return request({
    url: '/admin/merchant/' + id,
    method: 'get'
  });
}

// 新建商户（响应里带一次明文密钥）
export function createMerchant(data) {
  return request({
    url: '/admin/merchant/create',
    method: 'post',
    data: data
  });
}

// 修改商户
export function updateMerchant(data) {
  return request({
    url: '/admin/merchant/update',
    method: 'post',
    data: data
  });
}

// 启用/停用
export function enableMerchant(id, enabled) {
  return request({
    url: '/admin/merchant/enable/' + id + '/' + enabled,
    method: 'post'
  });
}

// 重置密钥（响应里带一次明文新密钥，旧密钥并行 prevDays 天）
export function resetMerchantKey(id, prevDays) {
  return request({
    url: '/admin/merchant/reset-key/' + id + (prevDays ? '?prevDays=' + prevDays : ''),
    method: 'post'
  });
}

// 商户下的玩家
export function listMerchantPlayers(id, data) {
  return request({
    url: '/admin/merchant/' + id + '/players',
    method: 'post',
    data: data
  });
}

// 商户转账流水
export function listMerchantTxns(id, data) {
  return request({
    url: '/admin/merchant/' + id + '/txns',
    method: 'post',
    data: data
  });
}
