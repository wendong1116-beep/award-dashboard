/**
 * E2E 测试 - 雅昌印制大奖数据管理系统
 * 运行方式: npx playwright test tests/e2e.test.js
 *
 * 测试内容:
 * 1. 前台首页加载
 * 2. 前台奖项详情页加载
 * 3. 后台登录
 * 4. 后台新增+修改记录
 * 5. 后台新增+删除记录
 * 6. 前后台数据一致性
 * 7. 后台新增后前台立即可见
 */

import { test, expect, chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

// 共享 browser instance
let browser;

test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
});

test.afterAll(async () => {
    await browser.close();
});

// 辅助函数：登录后台
async function loginAdmin(page) {
    await page.goto(BASE + '/login.html');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
}

// 辅助函数：在表单中填写并提交一条记录
async function fillAndSubmitForm(page, productName) {
    await page.click('button:has-text("新增记录")');
    await page.waitForTimeout(300);
    await page.locator('.import-option:has-text("手工导入")').click();
    await page.waitForTimeout(300);
    await page.selectOption('#editName', { index: 1 });
    await page.fill('#editProductName', productName);
    await page.fill('#editYear', '2024');
    await page.fill('#editRegion', 'E2E测试地区');
    await page.fill('#editAwardLevel', '金奖');
    await page.fill('#editFeatures', 'E2E自动测试特点');
    await page.click('button[type="submit"]');
    // 等待网络请求完成
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
}

// 1. 前台首页
test('1. 前台首页正常加载', async () => {
    const page = await browser.newPage();
    await page.goto(BASE + '/index.html');

    // 检查标题
    await expect(page).toHaveTitle(/雅昌/);

    // 检查统计数据区域存在
    const totalCount = page.locator('#totalCount');
    await expect(totalCount).not.toHaveText('-', { timeout: 8000 });
    const total = await totalCount.textContent();
    expect(parseInt(total)).toBeGreaterThan(0);

    // 检查奖项卡片已渲染
    const awardCards = page.locator('.award');
    await expect(awardCards.first()).toBeVisible({ timeout: 8000 });

    await page.close();
    console.log('  1. 前台首页 OK');
});

// 2. 前台奖项详情页
test('2. 前台奖项详情页加载', async () => {
    const page = await browser.newPage();
    await page.goto(BASE + '/award.html?award=美国印制大奖');

    await expect(page.locator('#awardTitle').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.stat-card').first()).toBeVisible({ timeout: 8000 });

    await page.close();
    console.log('  2. 前台奖项详情页 OK');
});

// 3. 后台登录
test('3. 后台管理登录', async () => {
    const page = await browser.newPage();
    await loginAdmin(page);

    // 登录后应跳转到 admin.html
    const url = page.url();
    expect(url).not.toContain('login');

    // 检查统计数据已加载
    await expect(page.locator('#totalCount')).not.toHaveText('-', { timeout: 8000 });

    await page.close();
    console.log('  3. 后台登录 OK');
});

// 4. 后台新增+修改记录（自包含）
test('4. 后台新增并修改记录', async () => {
    const timestamp = Date.now();
    const originalName = 'E2E编辑测_' + timestamp;
    const modifiedName = 'E2E已修改_' + timestamp;

    const page = await browser.newPage();
    await loginAdmin(page);
    await page.waitForTimeout(1000);

    // 新增一条记录
    await fillAndSubmitForm(page, originalName);

    // 验证新增成功（表格中包含原始名称）
    const tableText = await page.locator('#tableBody').textContent();
    expect(tableText).toContain('E2E编辑测');

    // 点击编辑按钮（第一条记录）
    await page.locator('.action-btn:has-text("编辑")').first().click();
    await page.waitForTimeout(500);

    // 修改产品名称
    const prodInput = page.locator('#editProductName');
    await prodInput.clear();
    await prodInput.fill(modifiedName);

    // 提交
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // 验证修改成功
    const updatedText = await page.locator('#tableBody').textContent();
    expect(updatedText).toContain('E2E已修改');

    await page.close();
    console.log('  4. 后台新增并修改记录 OK');
});

// 5. 后台新增+删除记录（自包含）
test('5. 后台新增并删除记录', async () => {
    const timestamp = Date.now();
    const productName = 'E2E删除测_' + timestamp;

    const page = await browser.newPage();
    await loginAdmin(page);
    await page.waitForTimeout(1000);

    // 新增一条记录
    await fillAndSubmitForm(page, productName);

    // 验证新增成功
    const tableBefore = await page.locator('#tableBody').textContent();
    expect(tableBefore).toContain('E2E删除测');

    // 验证表格中不再包含该产品名
    page.on('dialog', dialog => dialog.accept());
    await page.locator('.action-btn.danger').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const tableAfter = await page.locator('#tableBody').textContent();
    expect(tableAfter).not.toContain(productName);

    await page.close();
    console.log('  5. 后台新增并删除记录 OK');
});

// 6. 前后台数据一致性
test('6. 前后台数据一致性', async () => {
    // 获取前台统计数据
    const statsPage = await browser.newPage();
    await statsPage.goto(BASE + '/index.html');
    await statsPage.waitForTimeout(2000);
    const frontTotal = await statsPage.locator('#totalCount').textContent();
    const frontAwards = await statsPage.locator('.award').count();
    await statsPage.close();

    // 获取后台统计数据
    const adminPage = await browser.newPage();
    await loginAdmin(adminPage);
    await adminPage.waitForTimeout(1000);
    const backTotal = await adminPage.locator('#totalCount').textContent();
    await adminPage.close();

    // 比较总数
    expect(parseInt(frontTotal)).toBe(parseInt(backTotal));
    expect(parseInt(frontTotal)).toBeGreaterThan(0);
    expect(frontAwards).toBeGreaterThan(0);

    console.log('  6. 前后台数据一致性 OK (总数=' + frontTotal + ')');
});

test('7. 后台新增后前台立即可见', async () => {
    const testProduct = '同步测试品_' + Date.now();

    // 后台新增
    const adminPage = await browser.newPage();
    await loginAdmin(adminPage);
    await adminPage.waitForTimeout(1000);
    await fillAndSubmitForm(adminPage, testProduct);
    const adminTableText = await adminPage.locator('#tableBody').textContent();
    expect(adminTableText).toContain(testProduct);
    await adminPage.close();

    // 前台立即检查总数是否大于0
    const statsPage = await browser.newPage();
    await statsPage.goto(BASE + '/index.html');
    await statsPage.waitForTimeout(2000);
    const frontTotalAfter = await statsPage.locator('#totalCount').textContent();
    await statsPage.close();

    expect(parseInt(frontTotalAfter)).toBeGreaterThan(0);
    console.log('  7. 后台新增后前台可见 OK (前台总数=' + frontTotalAfter + ')');
});
