/**
 * API 测试 - 雅昌印制大奖数据管理系统
 * 运行方式: node tests/api.test.js
 */

import http from 'http';

const BASE = 'http://localhost:3000';

function request(method, path, { body, cookie, auth } = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Accept': 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(cookie ? { 'Cookie': cookie } : {}),
                ...(auth ? { 'Authorization': 'Bearer ' + auth } : {}),
            }
        };
        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = {};
                try { json = JSON.parse(data); } catch {}
                resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// 登录，返回 Bearer token
async function login() {
    const res = await request('POST', '/api/auth/login', {
        body: { username: 'admin', password: 'admin123' }
    });
    return { res, token: res.body.token || '' };
}

function authHeaders(token) {
    return token ? { auth: token } : {};
}

let pass = 0;
let fail = 0;

function assert(condition, msg) {
    if (condition) {
        console.log('  ok ' + msg);
        pass++;
    } else {
        console.log('  FAIL ' + msg);
        fail++;
    }
}

async function run() {
    console.log('\n========== API 测试 ==========\n');

    // 1. 公开 API
    console.log('1 公开 API');
    const stats = await request('GET', '/api/stats');
    assert(stats.status === 200, 'GET /api/stats 返回 200');
    assert(typeof stats.body.total === 'number', '/api/stats 返回总数字段');
    assert(stats.body.total > 0, '总数大于 0，当前=' + stats.body.total);
    assert(Array.isArray(stats.body.awards), '/api/stats 返回奖项列表');
    assert(stats.body.awardCount > 0, '奖项数量大于 0，当前=' + stats.body.awardCount);
    const beforeCount = stats.body.total;

    const awards = await request('GET', '/api/awards');
    assert(awards.status === 200, 'GET /api/awards 返回 200');
    assert(Array.isArray(awards.body), '/api/awards 返回数组');
    assert(awards.body.length > 0, '/api/awards 有数据，当前=' + awards.body.length);
    assert(awards.body.every(a => typeof a.name === 'string' && typeof a.count === 'number'),
        '/api/awards 每项包含 name 和 count');

    // 2. 认证流程
    console.log('\n2 认证流程');
    await request('POST', '/api/auth/logout');

    const { token: loginToken, res: loginHttpRes } = await login();
    assert(loginHttpRes.body.success === true, 'POST /api/auth/login 返回 success=true');
    assert(loginHttpRes.body.token && loginHttpRes.body.token.length > 0, 'login() 返回 token');

    const authCheck = await request('GET', '/api/auth/check', { ...authHeaders(loginToken) });
    assert(authCheck.body.authenticated === true, '/api/auth/check 已登录状态');

    // 登出后访问应返回 false（验证 session 确实在服务器端被清除）
    await request('POST', '/api/auth/logout', { ...authHeaders(loginToken) });
    const afterLogout = await request('GET', '/api/auth/check', { ...authHeaders(loginToken) });
    assert(afterLogout.body.authenticated === false, 'logout 后 session 已清除');

    // 重新登录（后续测试需要有效 token）
    const { token: adminToken, res: adminLoginRes } = await login();
    assert(adminLoginRes.body.success === true, '重新登录成功');

    // 3. 新增记录
    console.log('\n3 新增记录');
    const testRecord = {
        name: '测试奖项_自动化',
        product_name: '自动化测试产品_' + Date.now(),
        year: '2024',
        region: '北京',
        award_level: '金奖',
        award_category: '测试类',
        photography_type: '艺术摄影',
        binding: '精装',
        publisher: '测试出版社',
        features: '自动化测试特点',
        images: []
    };

    const addRes = await request('POST', '/api/admin/products', {
        body: testRecord,
        ...authHeaders(adminToken)
    });
    assert(addRes.status === 200, 'POST /api/admin/products 返回 200，当前=' + addRes.status);
    assert(addRes.body && typeof addRes.body.id === 'number', '新增返回 ID，当前=' + addRes.body?.id);
    assert(addRes.body?.id > 0, '新增 ID > 0，当前=' + addRes.body?.id);
    const newId = addRes.body?.id;

    const afterAdd = await request('GET', '/api/stats');
    assert(afterAdd.body.total === beforeCount + 1, '新增后总数正确 (' + beforeCount + ' -> ' + afterAdd.body.total + ')');

    const newAwards = await request('GET', '/api/awards');
    const newAwardItem = newAwards.body.find(a => a.name === '测试奖项_自动化');
    assert(newAwardItem !== undefined, '新奖项出现在 /api/awards 列表中');

    // 4. 读取单条
    console.log('\n4 读取单条记录');
    const getRes = await request('GET', '/api/products/' + newId);
    assert(getRes.status === 200, 'GET /api/products/' + newId + ' 返回 200');
    assert(getRes.body.id === newId, '返回正确的 ID');
    assert(getRes.body.product_name === testRecord.product_name, '产品名称正确');
    assert(getRes.body.region === '北京', '地区正确');
    assert(getRes.body.binding === '精装', '装订方式正确');
    assert(getRes.body.features === '自动化测试特点', '特点正确');
    assert(Array.isArray(getRes.body.images), 'images 是数组');
    assert(getRes.body.images.length === 0, 'images 数组为空');

    const adminList = await request('GET', '/api/admin/products?search=自动化测试', {
        ...authHeaders(adminToken)
    });
    assert(adminList.status === 200, '/api/admin/products 搜索成功');
    assert(adminList.body.items.some(i => i.id === newId), '管理后台能查到新记录');

    // 5. 修改记录
    console.log('\n5 修改记录');
    const updateRes = await request('PUT', '/api/admin/products/' + newId, {
        body: { ...testRecord, product_name: '已修改产品名_' + Date.now(), region: '上海', award_level: '银奖', images: [] },
        ...authHeaders(adminToken)
    });
    assert(updateRes.status === 200, 'PUT /api/admin/products 返回 200');
    assert(updateRes.body.success === true, '修改返回 success');

    const afterUpdate = await request('GET', '/api/products/' + newId);
    assert(afterUpdate.body.product_name.startsWith('已修改产品名'), '产品名已修改，当前=' + afterUpdate.body.product_name);
    assert(afterUpdate.body.region === '上海', '地区已修改');
    assert(afterUpdate.body.award_level === '银奖', '等级已修改');

    // 6. 删除记录
    console.log('\n6 删除记录');
    const deleteRes = await request('DELETE', '/api/admin/products/' + newId, {
        ...authHeaders(adminToken)
    });
    assert(deleteRes.status === 200, 'DELETE /api/admin/products 返回 200');
    assert(deleteRes.body.success === true, '删除返回 success');

    const afterDelete = await request('GET', '/api/stats');
    assert(afterDelete.body.total === beforeCount, '删除后总数恢复 (' + afterDelete.body.total + ' === ' + beforeCount + ')');

    const awardsAfterDel = await request('GET', '/api/awards');
    const afterDelItem = awardsAfterDel.body.find(a => a.name === '测试奖项_自动化');
    // 删除后该奖项数量应减少1（允许其他测试残留数据存在）
    const beforeDelAwardCount = newAwards.body.find(a => a.name === '测试奖项_自动化')?.count || 1;
    assert(!afterDelItem || afterDelItem.count === beforeDelAwardCount - 1,
        '删除后奖项数量减少1 (删除前:' + beforeDelAwardCount + ' 删除后:' + afterDelItem?.count + ')');

    // 7. 搜索功能
    console.log('\n7 搜索功能');
    const searchRes = await request('GET', '/api/search?q=印制');
    assert(searchRes.status === 200, '/api/search 返回 200');
    assert(Array.isArray(searchRes.body), '搜索返回数组');
    assert(searchRes.body.length > 0, '搜索有结果，当前=' + searchRes.body.length);
    assert(searchRes.body.every(r => r.product_name || r.name), '搜索结果包含产品信息');

    // 8. 数据一致性
    console.log('\n8 数据一致性');
    const allAwards = await request('GET', '/api/awards');
    const sum = allAwards.body.reduce((s, a) => s + a.count, 0);
    const statsAgain = await request('GET', '/api/stats');
    assert(sum === statsAgain.body.total, '/api/awards 总和(' + sum + ') === /api/stats.total(' + statsAgain.body.total + ')');

    // 9. 边界条件 - 空 images
    console.log('\n9 边界条件');
    const addEmptyImg = await request('POST', '/api/admin/products', {
        body: { name: '测试空图', product_name: '空图测试_' + Date.now(), images: [] },
        ...authHeaders(adminToken)
    });
    assert(addEmptyImg.status === 200, 'images=[] 可以新增, status=' + addEmptyImg.status);
    const emptyImgId = addEmptyImg.body?.id;
    if (emptyImgId) {
        const emptyImgCheck = await request('GET', '/api/products/' + emptyImgId);
        assert(emptyImgCheck.body?.images?.length === 0, 'images 字段正确处理空数组');
        await request('DELETE', '/api/admin/products/' + emptyImgId, { ...authHeaders(adminToken) });
    } else {
        assert(false, 'images=[] 新增未返回 ID');
    }

    // 统计报告
    console.log('\n========== 测试结果 ==========');
    console.log('  通过: ' + pass);
    console.log('  失败: ' + fail);
    console.log('  总计: ' + (pass + fail));
    console.log('');

    if (fail > 0) {
        console.log('有 ' + fail + ' 个测试失败，请检查！');
        process.exit(1);
    } else {
        console.log('全部测试通过！');
    }
}

run().catch(e => {
    console.error('测试运行异常:', e.message);
    process.exit(1);
});
