require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn } = require('child_process');
const { createWelcomeImage } = require('./Welcome/welcome');
const { setupLevelSystem } = require('./Congratulations/level');
const { setupBoostersSystem } = require('./Congratulations/boosters');
const { startServer, stopServer, getServerStatus, updateStatus } = require('./scripts/serverManager');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

if (!process.env.DISCORD_TOKEN) {
  console.error('خطأ: التوكن غير موجود في .env');
  process.exit(1);
}

const welcomeChannelId = process.env['welcome'];
if (!welcomeChannelId) {
  console.error('خطأ: مفتاح القناة welcome غير موجود في .env');
  process.exit(1);
}

client.once('ready', () => {
  console.log(`البوت جاهز! متصل باسم: ${client.user.tag}`);
  setupLevelSystem(client);
  setupBoostersSystem(client);
});

client.on('guildMemberAdd', async member => {
  try {
    await member.fetch();
    const welcomeChannel = member.guild.channels.cache.get(welcomeChannelId);
    if (!welcomeChannel) {
      console.error(`القناة بـ ID ${welcomeChannelId} غير موجودة أو لا يمكن الوصول إليها`);
      return;
    }

    const outputImage = await createWelcomeImage(member);
    await welcomeChannel.send(`${member.user}`);
    await welcomeChannel.send({
      files: ['./welcome/welcome-with-avatar-and-text.png']
    });
    console.log(`تم إرسال رسالة الترحيب بنجاح لـ ${member.user.tag} في القناة: ${welcomeChannel.name}`);
  } catch (error) {
    console.error('خطأ أثناء معالجة دخول عضو:', error.message);
  }
});

function callPythonScript(method) {
  return new Promise((resolve, reject) => {
    const cmd = `python ./scripts/ngrokManager.py ${method}`;
    console.log(`Executing command: ${cmd}`);
    const process = spawn('python', ['./scripts/ngrokManager.py', method]);

    let output = '';
    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    process.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python process exited with code ${code}`));
      }
      try {
        const result = JSON.parse(output);
        console.log(`Python script output: ${JSON.stringify(result)}`);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse JSON: ${output}`));
      }
    });
  });
}

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!') || message.author.bot) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'server') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('start').setLabel('تشغيل').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('stop').setLabel('إيقاف').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('status').setLabel('الحالة').setStyle(ButtonStyle.Primary)
      );

    try {
      const status = getServerStatus();
      await message.reply({
        content: `إدارة خادوم Spigot\nالحالة الحالية: **${status.server_status === 'running' ? 'يعمل' : 'متوقف'}**${status.ngrok_url ? `\nالعنوان: **${status.ngrok_url.replace('tcp://', '')}**` : ''}`,
        components: [row]
      });
    } catch (error) {
      console.error('Error getting server status:', error);
      await message.reply('حدث خطأ أثناء جلب حالة الخادوم.');
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const startTime = new Date().toISOString();
  console.log(`Interaction received: ${interaction.customId} at ${startTime}`);

  // الرد فوراً لتجنب المهلة
  try {
    await interaction.deferReply();
    console.log(`Deferred reply for ${interaction.customId} button at ${new Date().toISOString()}`);
  } catch (deferError) {
    console.error(`Failed to defer reply for ${interaction.customId}:`, deferError);
    try {
      await interaction.reply({ content: 'فشل في معالجة الطلب بسبب تأخير.', ephemeral: true });
    } catch (replyError) {
      console.error(`Failed to reply after defer failure:`, replyError);
    }
    return;
  }

  if (interaction.customId === 'start') {
    try {
      const status = getServerStatus();
      if (status.server_status === 'running') {
        await interaction.editReply('الخادوم يعمل بالفعل!');
        return;
      }

      await interaction.editReply('جاري تشغيل الخادوم...');

      await startServer();

      // تشغيل Ngrok
      const ngrokResult = await callPythonScript('start');
      if (ngrokResult.status === 'success') {
        const ngrokUrl = ngrokResult.url;
        updateStatus('running', ngrokUrl);
        await interaction.channel.send(`الخادوم جاهز الآن!\nالعنوان: **${ngrokUrl.replace('tcp://', '')}**`);
        await interaction.editReply('جاري تشغيل الخادوم...\nتم إرسال العنوان إلى الشات!');
      } else {
        await interaction.editReply('فشل في تشغيل Ngrok. تحقق من السجلات.');
      }
    } catch (error) {
      console.error('Error starting server:', error);
      await interaction.editReply('حدث خطأ أثناء تشغيل الخادوم. تحقق من السجلات.');
    }
  }

  if (interaction.customId === 'stop') {
    try {
      const status = getServerStatus();
      if (status.server_status !== 'running') {
        await interaction.editReply('الخادوم غير مشغل حالياً!');
        return;
      }

      await stopServer();
      const ngrokResult = await callPythonScript('stop');
      if (ngrokResult.status === 'success') {
        updateStatus('stopped', '');
        await interaction.editReply('تم إيقاف الخادوم وNgrok بنجاح!');
      } else {
        await interaction.editReply('تم إيقاف الخادوم، لكن فشل في إيقاف Ngrok. تحقق من السجلات.');
      }
    } catch (error) {
      console.error('Error stopping server:', error);
      await interaction.editReply('حدث خطأ أثناء إيقاف الخادوم.');
    }
  }

  if (interaction.customId === 'status') {
    try {
      const status = getServerStatus();
      await interaction.editReply(`حالة الخادوم: **${status.server_status === 'running' ? 'يعمل' : 'متوقف'}**${status.ngrok_url ? `\nالعنوان: **${status.ngrok_url.replace('tcp://', '')}**` : ''}`);
    } catch (error) {
      console.error('Error getting server status:', error);
      await interaction.editReply('حدث خطأ أثناء جلب حالة الخادوم.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('خطأ في تسجيل الدخول:', error.message);
  process.exit(1);
});