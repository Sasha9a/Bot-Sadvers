import { Antispam, AntispamModule } from "@bot-melissa/shared/schemas/antispam.schema";
import { Chat, ChatModule } from "@bot-melissa/shared/schemas/chat.schema";
import * as moment from "moment-timezone";

export async function createChat(chatId: number): Promise<Chat> {
  const chat: Chat = new ChatModule(<Partial<Chat>>{
    chatId: chatId,
    maxWarn: 3
  });
  return await chat.save();
}

export async function createAntispam(info: Partial<Antispam>): Promise<Antispam> {
  const antispam: Antispam = new AntispamModule(info);
  return await antispam.save();
}

export async function checkBanList(chat: Chat): Promise<void> {
  if (chat) {
    const local = chat.banList;
    for (const obj of chat.banList) {
      if (moment().diff(moment(obj.endDate), 'minutes') > 0) {
        chat.banList = chat.banList.filter((u) => u.id !== obj.id);
      }
    }
    if (local.length !== chat.banList.length) {
      chat.markModified('banList');
      await chat.save();
    }
  }
}

export async function checkMuteList(chat: Chat): Promise<void> {
  if (chat) {
    const local = chat.muteList;
    for (const obj of chat.muteList) {
      if (moment().diff(moment(obj.endDate), 'minutes') > 0) {
        chat.muteList = chat.muteList.filter((u) => u.id !== obj.id);
      }
    }
    if (local.length !== chat.muteList.length) {
      chat.markModified('muteList');
      await chat.save();
    }
  }
}

export async function deleteAntispam(chat: Chat): Promise<void> {
  if (chat) {
    await AntispamModule.deleteMany({ chatId: chat.chatId, date: { $lt: moment().startOf('day').toDate() } });
  }
}
