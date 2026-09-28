@echo off
REM ============================================================
REM Mock grsai CLI for ComfyUI node development
REM
REM 模拟真实 grsai banana / gpt / minimax-h3 的输出格式
REM (submit + 轮询心跳 + JSON)，不消耗 API 配额。
REM
REM 用法：
REM   1) copy D:\npm\grsai.cmd D:\npm\grsai.cmd.real
REM   2) copy mock-grsai.cmd D:\npm\grsai.cmd
REM   3) 测试节点...
REM   4) copy D:\npm\grsai.cmd.real D:\npm\grsai.cmd
REM
REM 环境变量 GRSAI_MOCK_MODE：
REM   fast  - 快速（默认，约 3 秒出图）
REM   slow  - 慢速（~80 秒，触发 2 次心跳推送）
REM   hang  - 一直轮询（max-wait 控制何时结束）
REM   error - 模拟业务错误
REM ============================================================

REM ===== 解析参数 =====
set COMMAND=banana
set PROMPT=test prompt
set OUTPUT_DIR=
set JSON_MODE=0

:loop
if "%~1"=="" goto endloop
if /i "%~1"=="banana" set COMMAND=banana& shift& goto loop
if /i "%~1"=="gpt" set COMMAND=gpt& shift& goto loop
if /i "%~1"=="minimax-h3" set COMMAND=minimax-h3& shift& goto loop
if /i "%~1"=="--json" set JSON_MODE=1& shift& goto loop
if /i "%~1"=="-p" set PROMPT=%~2& shift& shift& goto loop
if /i "%~1"=="--prompt" set PROMPT=%~2& shift& shift& goto loop
if /i "%~1"=="-o" set OUTPUT_DIR=%~2& shift& shift& goto loop
if /i "%~1"=="--output" set OUTPUT_DIR=%~2& shift& shift& goto loop
shift
goto loop

:endloop
if "%GRSAI_MOCK_MODE%"=="" set GRSAI_MOCK_MODE=fast

REM ===== 错误模式 =====
if /i "%GRSAI_MOCK_MODE%"=="error" goto do_error

REM ===== 1. 提交任务 =====
echo 任务已提交：mock-task-abcd1234 1>&2

REM ===== 2. 轮询阶段 =====
if /i "%GRSAI_MOCK_MODE%"=="fast" goto do_fast
if /i "%GRSAI_MOCK_MODE%"=="hang" goto do_hang

REM slow: 2 次心跳
ping -n 6 127.0.0.1 >nul
echo mock progress update 0%% to 5%% 1>&2
echo mock polling, elapsed 30s, progress 5%% 1>&2
ping -n 31 127.0.0.1 >nul
echo mock progress update 5%% to 50%% 1>&2
echo mock polling, elapsed 60s, progress 50%% 1>&2
goto do_done

:do_fast
ping -n 4 127.0.0.1 >nul
goto do_done

:do_hang
echo mock will hang, waiting for timeout 1>&2
:hang_forever
ping -n 11 127.0.0.1 >nul
echo mock polling, elapsed 30s, progress 50%% 1>&2
goto hang_forever

REM ===== 3. 生成图片 + 输出 JSON =====
:do_done
if "%OUTPUT_DIR%"=="" set OUTPUT_DIR=%TEMP%\mock-grsai-out
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%" 2>nul

REM 生成唯一文件名
set FILENAME=mock_%COMMAND:-=_%_%RANDOM%.png
set OUTPUT_FILE=%OUTPUT_DIR%\%FILENAME%

REM 写一个 1x1 白色 PNG (67 bytes)
powershell -NoProfile -Command "$b = [byte[]](0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,0x89,0x00,0x00,0x00,0x0D,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0x60,0x60,0x00,0x00,0x00,0x04,0x00,0x01,0x53,0x5C,0x50,0xB0,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82); [System.IO.File]::WriteAllBytes('%OUTPUT_FILE%',$b)" >nul

echo mock done: %OUTPUT_FILE%, took 1.2s 1>&2

REM 输出 JSON 到 stdout（替换路径里的反斜杠为双反斜杠）
set JSON_PATH=%OUTPUT_FILE:\=\\%
echo {"success":true,"command":"%COMMAND%","results":[{"path":"%JSON_PATH%","durationMs":1200}],"totalDurationMs":1200,"count":1}
exit /b 0

REM ===== 错误分支 =====
:do_error
echo mock task submitted, but will fail 1>&2
ping -n 3 127.0.0.1 >nul
echo {"success":false,"command":"%COMMAND%","error":"mock error: simulated business failure for testing"}
exit /b 1