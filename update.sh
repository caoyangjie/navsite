#!/bin/bash

# 停止服务
./stop.sh

# 更新代码
git pull

# 编译代码
npm install

# 启动服务
./start.sh
