import { RequestMessageVkModel } from "@bot-sadvers/api/vk/core/models/request.message.vk.model";
import { errorSend } from "@bot-sadvers/api/vk/core/utils/customMessage.utils.vk";
import { vk } from "@bot-sadvers/api/vk/vk";
import { Chat } from "@bot-sadvers/shared/schemas/chat.schema";
import { Marriage, MarriageModule } from "@bot-sadvers/shared/schemas/marriage.schema";
import { Status, StatusModule } from "@bot-sadvers/shared/schemas/status.schema";
import { User, UserModule } from "@bot-sadvers/shared/schemas/user.schema";
import * as moment from "moment-timezone";
import { ContextDefaultState, IResolvedOwnerResource, IResolvedTargetResource, MessageContext, resolveResource } from "vk-io";
import { MessagesConversationMember, UsersUserFull } from "vk-io/lib/api/schemas/objects";

export async function createUser(peerId: number, req: RequestMessageVkModel): Promise<User> {
  const user: User = new UserModule({
    peerId: peerId,
    chatId: req.msgObject.peerId,
    status: 0
  });
  return await user.save();
}

export async function stringifyMention(userId: number, userInfo?: any): Promise<string> {
  let dataUser;
  if (userInfo) {
    dataUser = userInfo;
  } else {
    dataUser = await vk.api.users.get({ user_ids: [userId] });
    dataUser = dataUser[0];
  }
  if (dataUser) {
    return `[id${dataUser.id}|${dataUser.first_name + ' ' + dataUser.last_name}]`;
  } else {
    return '';
  }
}

export async function isOwnerMember(peerId: number, chatId: number): Promise<boolean> {
  const chatInfo = await vk.api.messages.getConversationsById({ peer_ids: chatId });
  return chatInfo.items[0]?.chat_settings?.owner_id === peerId;
}

export async function templateGetUser(user: User, chat: Chat): Promise<string> {
  const status: Status = await StatusModule.findOne({ chatId: user.chatId, status: user?.status }, { name: 1 });
  const marriages: Marriage[] = await MarriageModule.find({ chatId: chat.chatId, isConfirmed: true, $or: [ { userFirstId: user.peerId }, { userSecondId: user.peerId } ] });
  let result = `Участник ${await stringifyMention(user.peerId)}:`;
  if (user?.joinDate) {
    result = result.concat(`\nВ беседе c ${moment(user.joinDate).format('DD.MM.YYYY HH:mm')} (${moment().diff(user.joinDate, 'days')} дн.)`);
  } else {
    result = result.concat(`\nВ беседе c -`);
  }
  result = result.concat(`\nНик: ${user?.nick || '-'}`);
  result = result.concat(`\nЗначок: ${user?.icon || '-'}`);
  if (status?.name?.length) {
    result = result.concat(`\nСтатус: ${status.name} (${user?.status || 0})`);
  } else {
    result = result.concat(`\nСтатус: ${user?.status || 0}`);
  }
  result = result.concat(`\nПредупреждения: ${user?.warn || 0} / ${chat.maxWarn}`);
  if (marriages?.length) {
    result = result.concat(`\nВ браке с `);
    for (let i = 0; i != marriages.length; i++) {
      result = result.concat(`${await stringifyMention(marriages[i].userFirstId === user.peerId ? marriages[i].userSecondId : marriages[i].userFirstId)}${i !== marriages.length - 1 ? ', ' : ''}`);
    }
  }
  return result;
}

export async function getResolveResource(text: string): Promise<void | IResolvedTargetResource | IResolvedOwnerResource> {
  return await resolveResource({
    api: vk.api,
    resource: text
  }).catch(console.error);
}

export async function getFullUserInfo(user: string, message: MessageContext<ContextDefaultState>): Promise<User> {
  const resource = await getResolveResource(user);
  if (!resource || !['user', 'group'].includes(resource.type)) {
    await errorSend(message, 'Пользователь не верно указан');
    return null;
  }
  const userResult: User = await UserModule.findOne({ peerId: resource.id, chatId: message.peerId });
  if (!userResult) {
    await errorSend(message, 'Нет такого пользователя');
    return null;
  }
  return userResult;
}

export async function updateLastActivityUser(message: MessageContext<ContextDefaultState>) {
  await UserModule.updateOne({ peerId: message.senderId, chatId: message.peerId }, { lastActivityDate: moment().toDate() });
}

export async function autoKickInDays(chat: Chat, message: MessageContext<ContextDefaultState>, members: { id: number, item: MessagesConversationMember, profile: UsersUserFull, info: User }[]) {
  if (chat && chat.autoKickInDays > 0 && (!chat.autoKickInDaysDate || moment().diff(moment(chat.autoKickInDaysDate)) / 1000 / 60 / 60 > 12)) {
    chat.autoKickInDaysDate = moment().toDate();
    await chat.save();

    let membersList = members;
    membersList = membersList.filter((m) => m.profile);
    for (const member of membersList) {
      if (member.info?.lastActivityDate) {
        const days = moment().diff(moment(member.info.lastActivityDate)) / 1000 / 60 / 60 / 24;
        if (Number(days.toFixed()) >= chat.autoKickInDays) {
          await vk.api.messages.removeChatUser({ chat_id: message.peerId - 2000000000, member_id: member.id, user_id: member.id }).catch(console.error);
        }
      } else if (member.info?.joinDate) {
        const days = moment().diff(moment(member.info.joinDate)) / 1000 / 60 / 60 / 24;
        if (Number(days.toFixed()) >= chat.autoKickInDays) {
          await vk.api.messages.removeChatUser({ chat_id: message.peerId - 2000000000, member_id: member.id, user_id: member.id }).catch(console.error);
        }
      }
    }
  }
}
