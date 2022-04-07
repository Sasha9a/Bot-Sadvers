import { PeerTypeVkEnum } from "@bot-sadvers/api/vk/core/enums/peer.type.vk.enum";
import { RequestMessageVkModel } from "@bot-sadvers/api/vk/core/models/request.message.vk.model";
import { errorSend } from "@bot-sadvers/api/vk/core/utils/error.utils.vk";
import { createChat } from "@bot-sadvers/api/vk/module/chat/chat.utils.vk";
import { parseMention, stringifyMention } from "@bot-sadvers/api/vk/module/user/user.utils.vk";
import { vk } from "@bot-sadvers/api/vk/vk";
import { CommandVkEnum } from "@bot-sadvers/shared/enums/command.vk.enum";
import { TypeMarriagesEnum } from "@bot-sadvers/shared/enums/type.marriages.enum";
import { Chat, ChatModule } from "@bot-sadvers/shared/schemas/chat.schema";
import { Marriage, MarriageModule } from "@bot-sadvers/shared/schemas/marriage.schema";
import { User, UserModule } from "@bot-sadvers/shared/schemas/user.schema";
import { Keyboard } from "vk-io";
import { MessagesConversationMember, UsersUserFull } from "vk-io/lib/api/schemas/objects";
import * as moment from "moment-timezone";

export async function marriage(req: RequestMessageVkModel) {
  if (req.msgObject.peerType == PeerTypeVkEnum.CHAT) {
    if (req.text.length !== 1) {
      return errorSend(req.msgObject, 'Не все параметры введены\nБрак [пользователь]');
    }
    let chat: Chat = await ChatModule.findOne({ chatId: req.msgObject.peerId });
    if (!chat) {
      chat = await createChat(req.msgObject.peerId);
    }
    const user: User = await UserModule.findOne({ peerId: parseMention(req.text[0])?.id, chatId: req.msgObject.peerId });
    if (!user) {
      return errorSend(req.msgObject, 'Нет такого пользователя');
    }
    if (await MarriageModule.findOne({ chatId: req.msgObject.peerId, $or: [ { userFirstId: req.msgObject.senderId, userSecondId: user.peerId }, { userFirstId: user.peerId, userSecondId: req.msgObject.senderId } ] })) {
      return errorSend(req.msgObject, 'Вы уже находитесь в браке с этим пользователем или на стадии оформления');
    }
    if (chat.typeMarriages === TypeMarriagesEnum.traditional || chat.typeMarriages === TypeMarriagesEnum.sameSex) {
      const marriageCurrentUser: Marriage = await MarriageModule.findOne({ chatId: req.msgObject.peerId, $or: [ { userFirstId: req.msgObject.senderId }, { userSecondId: req.msgObject.senderId } ] });
      if (marriageCurrentUser) {
        return errorSend(req.msgObject, 'Вы уже находитесь в браке или на стадии оформления');
      }
      const marriageUser: Marriage = await MarriageModule.findOne({ chatId: req.msgObject.peerId, $or: [ { userFirstId: user.peerId }, { userSecondId: user.peerId } ] });
      if (marriageUser) {
        return errorSend(req.msgObject, `Пользователь ${await stringifyMention(user.peerId)} уже состоит в браке или на стадии оформления`);
      }
    }
    const members = await vk.api.messages.getConversationMembers({ peer_id: req.msgObject.peerId });
    const membersList: { id: number, item: MessagesConversationMember, profile: UsersUserFull }[] = [];
    for (const member of members.items) {
      membersList.push({
        id: member.member_id,
        item: member,
        profile: members.profiles.find((profile) => profile.id === member.member_id)
      });
    }
    if (chat.typeMarriages === TypeMarriagesEnum.traditional || chat.typeMarriages === TypeMarriagesEnum.polygamy) {
      const firstUser = membersList.find((u) => u.id === req.msgObject.senderId);
      const secondUser = membersList.find((u) => u.id === user.peerId);
      if (firstUser?.profile?.sex === secondUser?.profile?.sex) {
        return errorSend(req.msgObject, 'Однополые браки запрещены');
      }
    }
    const marriage = new MarriageModule(<Partial<Marriage>>{
      chatId: req.msgObject.peerId,
      userFirstId: req.msgObject.senderId,
      userSecondId: user.peerId
    });
    await marriage.save();
    const builder = Keyboard.builder()
      .callbackButton({
        label: 'Да',
        payload: {
          command: CommandVkEnum.marriage,
          status: 1,
          userId: user.peerId,
          userFromId: req.msgObject.senderId
        },
        color: Keyboard.POSITIVE_COLOR
    }).callbackButton({
        label: 'Нет',
        payload: {
          command: CommandVkEnum.marriage,
          status: 0,
          userId: user.peerId,
          userFromId: req.msgObject.senderId
        },
        color: Keyboard.NEGATIVE_COLOR
      });
    req.msgObject.send(`${await stringifyMention(req.msgObject.senderId)} решился сделать предложение ${await stringifyMention(user.peerId)}`, { keyboard: builder.inline() }).catch(console.error);
  }
}

export async function marriages(req: RequestMessageVkModel) {
  if (req.msgObject.peerType == PeerTypeVkEnum.CHAT) {
    const marriages: Marriage[] = await MarriageModule.find({ chatId: req.msgObject.peerId });
    let result = 'Браки пользователей беседы:';
    for (const marriage of marriages) {
      if (marriage.isConfirmed) {
        result = result.concat(`\n${await stringifyMention(marriage.userFirstId)} и ${await stringifyMention(marriage.userSecondId)} (${moment().diff(marriage.marriageDate, 'days')} дн.)`);
      }
    }
    req.msgObject.send(result).catch(console.error);
  }
}