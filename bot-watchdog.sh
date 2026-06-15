#!/bin/bash
# سكريبت الحفاظ على تشغيل بوت مود شات
# يفحص كل 30 ثانية ويعيد تشغيل البوت إذا توقف

BOT_SCRIPT="src/lib/bot-polling.ts"
LOG_FILE="/home/z/my-project/bot-polling.log"
PID_FILE="/home/z/my-project/bot-polling.pid"
CHECK_INTERVAL=30
MAX_RESTARTS=10
RESTART_COUNT=0
LAST_RESTART_TIME=0

cd /home/z/my-project

echo "=== مود شات - نظام المراقبة ===" 
echo "بدء التشغيل: $(date)"

start_bot() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] جاري تشغيل البوت..."
    
    # إيقاف أي عملية موجودة
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        kill "$OLD_PID" 2>/dev/null
        sleep 2
    fi
    
    # تشغيل البوت
    nohup npx tsx "$BOT_SCRIPT" >> "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] البوت يعمل بالـ PID: $NEW_PID"
    
    # انتظار للتأكد من التشغيل
    sleep 5
    
    if kill -0 "$NEW_PID" 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ البوت يعمل بنجاح"
        return 0
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ فشل تشغيل البوت"
        return 1
    fi
}

check_bot() {
    if [ ! -f "$PID_FILE" ]; then
        return 1
    fi
    
    PID=$(cat "$PID_FILE")
    
    if kill -0 "$PID" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# تشغيل البوت لأول مرة
start_bot

# حلقة المراقبة
while true; do
    sleep $CHECK_INTERVAL
    
    if ! check_bot; then
        CURRENT_TIME=$(date +%s)
        TIME_SINCE_LAST=$((CURRENT_TIME - LAST_RESTART_TIME))
        
        # منع إعادة التشغيل السريع
        if [ $TIME_SINCE_LAST -lt 10 ]; then
            RESTART_COUNT=$((RESTART_COUNT + 1))
        else
            RESTART_COUNT=1
        fi
        LAST_RESTART_TIME=$CURRENT_TIME
        
        if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ تم تجاوز الحد الأقصى لإعادة التشغيل ($MAX_RESTARTS). انتظار 5 دقائق..."
            sleep 300
            RESTART_COUNT=0
        fi
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ البوت توقف! إعادة التشغيل (محاولة $RESTART_COUNT/$MAX_RESTARTS)..."
        start_bot
    fi
done
