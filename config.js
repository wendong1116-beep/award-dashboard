// 配置文件
export default {
  port: 3000,
  admin: {
    username: 'admin',
    password: 'admin123'  // 生产环境应使用更复杂的密码
  },
  database: {
    path: './database.sqlite'
  }
};