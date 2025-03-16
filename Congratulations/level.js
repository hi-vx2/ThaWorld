const fs = require('fs');

// مسار ملف التخزين
const DATA_FILE = './users.json';

// تعريف users في نطاق عام
let users = {};

// تحميل البيانات من الملف عند بدء التشغيل
if (fs.existsSync(DATA_FILE)) {
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  users = JSON.parse(data);
}

// دالة لحساب مستوى بناءً على التجربة
function calculateLevel(xp) {
  let level = 0;
  let xpRequired = 0;
  while (xpRequired <= xp) {
    level++;
    xpRequired += 75 * Math.pow(2, level - 1);
  }
  return level - 1;
}

// دالة لحساب التجربة المطلوبة للمستوى التالي
function xpForNextLevel(level) {
  let xpRequired = 0;
  for (let i = 1; i <= level; i++) {
    xpRequired += 75 * Math.pow(2, i - 1);
  }
  return xpRequired + (75 * Math.pow(2, level));
}

// دالة لتحديث بيانات المستخدمين
function updateUserData(userId, xpToAdd) {
  if (!users[userId]) {
    users[userId] = { xp: 0, level: 0 };
  }

  const previousLevel = users[userId].level;

  users[userId].xp += xpToAdd;

  const currentLevel = calculateLevel(users[userId].xp);
  if (currentLevel > users[userId].level) {
    users[userId].level = currentLevel;
    return { leveledUp: true, newLevel: currentLevel, previousLevel: previousLevel };
  }

  return { leveledUp: false, newLevel: users[userId].level, previousLevel: previousLevel };
}

// دالة لحفظ البيانات
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// دالة لإعداد النظام
function setupLevelSystem(client) {
  const levelUpChannelId = process.env.LEVEL_UP_CHANNEL;

  if (!levelUpChannelId) {
    console.error('خطأ: مفتاح LEVEL_UP_CHANNEL غير موجود في .env');
    return;
  }

  client.on('messageCreate', message => {
    if (message.author.bot) return; // تجاهل البوتات

    // نظام التجربة العادي
    const xpToAdd = 20;
    const result = updateUserData(message.author.id, xpToAdd);

    if (result.leveledUp) {
      const levelUpChannel = client.channels.cache.get(levelUpChannelId);
      if (levelUpChannel) {
        const userMention = `<@${message.author.id}>`;
        const levelUpMessage = `🥳 **Congratulations**, ${userMention}!\nYou climbed from level **${result.previousLevel}** to **${result.newLevel}**. Keep it up!`;
        levelUpChannel.send(levelUpMessage);
      } else {
        console.error(`القناة بـ ID ${levelUpChannelId} غير موجودة أو لا يمكن الوصول إليها`);
      }
    }

    // حفظ البيانات
    saveData();
  });
}

module.exports = { setupLevelSystem };