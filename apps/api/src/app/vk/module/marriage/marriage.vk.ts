import { PeerTypeVkEnum } from "@bot-sadvers/api/vk/core/enums/peer.type.vk.enum";
import { RequestMessageVkModel } from "@bot-sadvers/api/vk/core/models/request.message.vk.model";
import { errorSend } from "@bot-sadvers/api/vk/core/utils/customMessage.utils.vk";
import { getFullUserInfo, stringifyMention } from "@bot-sadvers/api/vk/module/user/user.utils.vk";
import { CommandVkEnum } from "@bot-sadvers/shared/enums/command.vk.enum";
import { TypeMarriagesEnum } from "@bot-sadvers/shared/enums/type.marriages.enum";
import { Marriage, MarriageModule } from "@bot-sadvers/shared/schemas/marriage.schema";
import { User } from "@bot-sadvers/shared/schemas/user.schema";
import { Keyboard } from "vk-io";
import * as moment from "moment-timezone";

export async function marriage(req: RequestMessageVkModel) {
  if (req.msgObject.peerType == PeerTypeVkEnum.CHAT) {
    if (req.text.length !== 1) {
      return errorSend(req.msgObject, 'Не все параметры введены\nЛиса брак [пользователь]');
    }
    const user: User = await getFullUserInfo(req.text[0], req.msgObject);
    if (!user) {
      return ;
    }
    if (req.msgObject.senderId === user.peerId) {
      return errorSend(req.msgObject, 'Нельзя самому себе предложить брак');
    }
    if (await MarriageModule.findOne({ chatId: req.msgObject.peerId, $or: [ { userFirstId: req.msgObject.senderId, userSecondId: user.peerId }, { userFirstId: user.peerId, userSecondId: req.msgObject.senderId } ] })) {
      return errorSend(req.msgObject, 'Вы уже находитесь в браке с этим пользователем или на стадии оформления');
    }
    if (req.chat.typeMarriages === TypeMarriagesEnum.traditional || req.chat.typeMarriages === TypeMarriagesEnum.sameSex) {
      const marriageCurrentUser: Marriage = await MarriageModule.findOne({ chatId: req.msgObject.peerId, $or: [ { userFirstId: req.msgObject.senderId }, { userSecondId: req.msgObject.senderId } ] });
      if (marriageCurrentUser) {
        return errorSend(req.msgObject, 'Вы уже находитесь в браке или на стадии оформления');
      }
      const marriageUser: Marriage = await MarriageModule.findOne({ chatId: req.msgObject.peerId, $or: [ { userFirstId: user.peerId }, { userSecondId: user.peerId } ] });
      if (marriageUser) {
        return errorSend(req.msgObject, `Пользователь ${await stringifyMention({ userId: user.peerId, userInfo: req.members.find((m) => m.id === user.peerId)?.profile })} уже состоит в браке или на стадии оформления`);
      }
    }
    if (req.chat.typeMarriages === TypeMarriagesEnum.traditional || req.chat.typeMarriages === TypeMarriagesEnum.polygamy) {
      const firstUser = req.members.find((u) => u.id === req.msgObject.senderId);
      const secondUser = req.members.find((u) => u.id === user.peerId);
      if (firstUser?.profile?.sex === secondUser?.profile?.sex) {
        return errorSend(req.msgObject, 'Однополые браки запрещены');
      }
    }
    const marriage = new MarriageModule(<Partial<Marriage>>{
      chatId: req.msgObject.peerId,
      userFirstId: req.msgObject.senderId,
      userSecondId: user.peerId,
      checkDate: moment().toDate()
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
    let result = `${await stringifyMention({ userId: req.msgObject.senderId, userInfo: req.members.find((m) => m.id === req.msgObject.senderId)?.profile })}`;
    result = result.concat(` решился сделать предложение ${await stringifyMention({ userId: user.peerId, userInfo: req.members.find((m) => m.id === user.peerId)?.profile })}`);
    req.msgObject.send(result, { keyboard: builder.inline() }).catch(console.error);
  }
}

export async function marriages(req: RequestMessageVkModel) {
  if (req.msgObject.peerType == PeerTypeVkEnum.CHAT) {
    const marriages: Marriage[] = await MarriageModule.find({ chatId: req.msgObject.peerId });
    let result = 'Браки пользователей беседы:';
    for (const marriage of marriages) {
      if (marriage.isConfirmed) {
        result = result.concat(`\n${await stringifyMention({ userId: marriage.userFirstId, userInfo: req.members.find((m) => m.id === marriage.userFirstId)?.profile })} и`);
        result = result.concat(` ${await stringifyMention({ userId: marriage.userSecondId, userInfo: req.members.find((m) => m.id === marriage.userSecondId)?.profile })}`);
        result = result.concat(` (${moment().diff(marriage.marriageDate, 'days')} дн.)`);
      }
    }
    req.msgObject.send(result, { disable_mentions: true }).catch(console.error);
  }
}

export async function divorce(req: RequestMessageVkModel) {
  if (req.msgObject.peerType == PeerTypeVkEnum.CHAT) {
    if (req.text.length !== 1) {
      return errorSend(req.msgObject, 'Не все параметры введены\nЛиса развод [пользователь]');
    }
    const user: User = await getFullUserInfo(req.text[0], req.msgObject);
    if (!user) {
      return ;
    }
    if (!await MarriageModule.findOne({ chatId: req.msgObject.peerId, isConfirmed: true, $or: [ { userFirstId: req.msgObject.senderId, userSecondId: user.peerId }, { userFirstId: user.peerId, userSecondId: req.msgObject.senderId } ] })) {
      return errorSend(req.msgObject, 'Вы не в браке');
    }
    await MarriageModule.deleteOne({ chatId: req.msgObject.peerId, $or: [ {userFirstId: req.msgObject.senderId, userSecondId: user.peerId}, {userFirstId: user.peerId, userSecondId: req.msgObject.senderId} ] });
    req.msgObject.send(`${await stringifyMention({ userId: req.msgObject.senderId, userInfo: req.user.profile })} и ${await stringifyMention({ userId: user.peerId, userInfo: req.members.find((m) => m.id === user.peerId)?.profile })} развелись`).catch(console.error);
  }
}
