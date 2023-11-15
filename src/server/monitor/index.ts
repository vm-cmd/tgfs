import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

import { config } from 'src/config';

export const createBot = () => {
  const bot = new Telegraf(config.monitor.bot_token);

  bot.use(async (ctx, next) => {
    if (ctx.chat.id !== config.monitor.chat_id) {
      return;
    }
    await next();
  });

  bot.catch((err) => {
    console.error(err);
  });

  bot.on(message('sticker'), (ctx) => ctx.reply('👍'));
  bot.hears('hi', (ctx) => ctx.reply(ctx.chat.id.toString()));
  return bot;
};

export const startBot = () => {
  const bot = createBot();
  bot.launch();
};
