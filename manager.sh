#!/bin/bash

# 定义日志文件
LOG_FILE="npm_start.log"
APP_NAME="server.js"  # 根据你的应用名称设置

# 启动函数
start() {
    echo "启动服务..."
    npm run start > "$LOG_FILE" 2>&1 &
    # 使用 $! 记录最近启动的进程ID
    echo $! > pid.file  # 记录进程ID到文件
    disown  # 解除当前作业与终端的关联
}

# 停止函数
stop() {
    # 使用 ps 和 grep 找到进程
    PIDS=$(ps -ef | grep "$APP_NAME" | grep -v grep | awk '{print $2}' | tr '\n' ' ')
    if [ -n "$PIDS" ]; then
        echo "停止服务 (PID: $PIDS)..."
        kill $PIDS && rm pid.file  # 删除PID文件
    else
        echo "服务未运行。"
    fi
}

# 检查参数
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    *)
        echo "用法: $0 {start|stop}"
        exit 1
        ;;
esac

