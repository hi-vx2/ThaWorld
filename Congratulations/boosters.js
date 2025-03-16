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

// دالة لإعداد نظام الـ Server Boosts
function setupBoostersSystem(client) {
  // جلب Channel IDs من .env
  const thanksChannelId = process.env.THANKS_CHANNEL;
  const levelUpChannelId = process.env.LEVEL_UP_CHANNEL;

  if (!thanksChannelId || !levelUpChannelId) {
    console.error('خطأ: أحد مفاتيح THANKS_CHANNEL أو LEVEL_UP_CHANNEL غير موجود في .env');
    return;
  }

  // جلب القنوات
  const thanksChannel = client.channels.cache.get(thanksChannelId);
  const levelUpChannel = client.channels.cache.get(levelUpChannelId);

  if (!thanksChannel || !levelUpChannel) {
    console.error('خطأ: إحدى القنوات غير موجودة أو لا يمكن الوصول إليها');
    return;
  }

  // حدث لمراقبة إضافة Boost
  client.on('guildMemberUpdate', (oldMember, newMember) => {
    // التحقق إذا العضو أضاف Boost (حصل على دور Nitro Booster)
    const boosterRole = newMember.guild.roles.cache.find(role => role.name === 'Nitro Booster' || role.tags?.premiumSubscriberRole);
    if (!boosterRole) return;

    if (!oldMember.roles.cache.has(boosterRole.id) && newMember.roles.cache.has(boosterRole.id)) {
      const userMention = `<@${newMember.id}>`;
      const thankMessage = `شكرًا ${userMention} لدعم السيرفر بـ Boost! 🎉`;
      thanksChannel.send(thankMessage);

      // إضافة 100 XP كمكافأة
      const xpToAdd = 100;
      const result = updateUserData(newMember.id, xpToAdd);
      saveData();

      // التحقق من الترقية بعد المكافأة
      if (result.leveledUp) {
        const levelUpMessage = `🥳 **Congratulations**, ${userMention}!\nYou climbed from level **${result.previousLevel}** to **${result.newLevel}**. Keep it up!`;
        levelUpChannel.send(levelUpMessage);
      }
    }
  });
}

module.exports = { setupBoostersSystem };