// استيراد المكتبات المطلوبة
const sharp = require('sharp');
const fs = require('fs');
const { createCanvas, registerFont } = require('canvas');
const axios = require('axios');

// تسجيل خط DejaVu Sans إذا كان موجودًا
try {
  registerFont('welcome/DejaVuSans.ttf', { family: 'DejaVu Sans' });
  console.log('تم تسجيل خط DejaVu Sans بنجاح في welcome.js');
} catch (error) {
  console.warn('لم يتم العثور على DejaVuSans.ttf، سيتم استخدام خط افتراضي (Arial) في welcome.js');
}

// دالة لإنشاء صورة الترحيب
async function createWelcomeImage(member) {
  try {
    // مسار الصورة الأساسية (welcome.png) والمخرج
    const inputImage = 'welcome/welcome.png';
    const outputImage = 'welcome/welcome-with-avatar-and-text.png';

    // تحقق من وجود الصورة
    if (!fs.existsSync(inputImage)) {
      throw new Error('الصورة welcome.png غير موجودة في المجلد');
    }

    // جلب رابط صورة الحساب باستخدام member مباشرة
    let avatarURL;
    try {
      avatarURL = member.displayAvatarURL({ format: 'png', size: 512 });
    } catch (error) {
      console.warn(`تعذر جلب صورة الحساب لـ ${member.id}. استخدام الصورة الافتراضية.`);
      avatarURL = 'https://cdn.discordapp.com/embed/avatars/0.png'; // صورة افتراضية
    }

    const response = await axios.get(avatarURL, { responseType: 'arraybuffer' });
    const avatarBuffer = Buffer.from(response.data, 'binary');

    // تغيير حجم صورة الحساب إلى 80x80
    const resizedAvatar = await sharp(avatarBuffer)
      .resize(80, 80, { fit: 'fill' })
      .png()
      .toBuffer();

    // قراءة ملف config.json
    const configData = fs.readFileSync('welcome/config.json', 'utf8');
    const config = JSON.parse(configData);
    const { height, widthMultiplier } = config.box;
    const username = member.user ? member.user.username : member.displayName; // استخدام displayName إذا user غير موجود
    const autoWidth = 40 + (username.length * widthMultiplier);

    // تحديد مواقع العناصر
    const avatarCenterX = 56;
    const avatarCenterY = 106;
    const usernameCenterX = 309;
    const usernameCenterY = 84;
    const welcomeTextStartX = 212;
    const welcomeTextEndX = 412;
    const welcomeTextStartY = 126;
    const welcomeTextEndY = 144;

    // حساب مركز نص "Welcome to Our Server"
    const welcomeTextCenterX = Math.floor((welcomeTextStartX + welcomeTextEndX) / 2);
    const welcomeTextCenterY = Math.floor((welcomeTextStartY + welcomeTextEndY) / 2);
    const welcomeTextHeight = welcomeTextEndY - welcomeTextStartY;

    // حساب بداية صورة الحساب بناءً على مركزها
    const avatarX = Math.floor(avatarCenterX - (80 / 2));
    const avatarY = Math.floor(avatarCenterY - (80 / 2));

    // قراءة الصورة الأصلية وحساب أبعادها
    const baseImage = sharp(inputImage);
    const metadata = await baseImage.metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // إنشاء Canvas لكتابة اسم المستخدم
    const usernameCanvas = createCanvas(autoWidth, height);
    const usernameCtx = usernameCanvas.getContext('2d');
    usernameCtx.font = '24px DejaVu Sans';
    usernameCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    usernameCtx.textAlign = 'center';
    usernameCtx.textBaseline = 'middle';
    usernameCtx.fillText(username, autoWidth / 2, height / 2);
    const usernameOverlay = usernameCanvas.toBuffer('image/png');

    // حساب مواقع اسم المستخدم
    const usernameX = Math.floor(usernameCenterX - (autoWidth / 2));
    const usernameY = Math.floor(usernameCenterY - (height / 2));

    // إنشاء Canvas لكتابة نص "Welcome to Our Server"
    const welcomeText = "Welcome to Our Server";
    const welcomeCanvas = createCanvas(welcomeTextEndX - welcomeTextStartX, welcomeTextHeight);
    const welcomeCtx = welcomeCanvas.getContext('2d');
    welcomeCtx.font = '18px DejaVu Sans';
    welcomeCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    welcomeCtx.textAlign = 'center';
    welcomeCtx.textBaseline = 'middle';
    welcomeCtx.fillText(welcomeText, (welcomeTextEndX - welcomeTextStartX) / 2, welcomeTextHeight / 2);
    const welcomeOverlay = welcomeCanvas.toBuffer('image/png');

    // تحقق من أن العناصر ضمن حدود الصورة
    if (usernameX < 0 || usernameY < 0 || usernameX + autoWidth > originalWidth || usernameY + height > originalHeight) {
      throw new Error(`اسم المستخدم خارج حدود الصورة (${originalWidth}x${originalHeight}). x=${usernameX}, y=${usernameY}, عرض=${autoWidth}, طول=${height}`);
    }
    if (avatarX < 0 || avatarY < 0 || avatarX + 80 > originalWidth || avatarY + 80 > originalHeight) {
      throw new Error(`صورة الحساب خارج حدود الصورة (${originalWidth}x${originalHeight}). x=${avatarX}, y=${avatarY}`);
    }
    if (welcomeTextStartX < 0 || welcomeTextStartY < 0 || welcomeTextEndX > originalWidth || welcomeTextEndY > originalHeight) {
      throw new Error(`نص الترحيب خارج حدود الصورة (${originalWidth}x${originalHeight}). x=${welcomeTextStartX}-${welcomeTextEndX}, y=${welcomeTextStartY}-${welcomeTextEndY}`);
    }

    // دمج الصور والنصوص على welcome.png
    await baseImage
      .composite([
        { input: resizedAvatar, top: avatarY, left: avatarX },
        { input: usernameOverlay, top: usernameY, left: usernameX },
        { input: welcomeOverlay, top: welcomeTextStartY, left: welcomeTextStartX }
      ])
      .toFile(outputImage);

    return outputImage; // إرجاع مسار الصورة الناتجة
  } catch (error) {
    throw new Error(`خطأ أثناء إنشاء صورة الترحيب: ${error.message}`);
  }
}

module.exports = { createWelcomeImage };