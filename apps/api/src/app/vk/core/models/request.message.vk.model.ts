import { CommandVkEnum } from "@bot-melissa/shared/enums/command.vk.enum";
import { Chat } from "@bot-melissa/shared/schemas/chat.schema";
import { User } from "@bot-melissa/shared/schemas/user.schema";
import { ContextDefaultState, MessageContext } from "vk-io";
import { MessagesConversationMember, UsersUserFull } from "vk-io/lib/api/schemas/objects";

export class RequestMessageVkModel {
  public command: CommandVkEnum;
  public fullText: string;
  public text: string[];
  public msgObject: MessageContext<ContextDefaultState>;
  public chat: Chat;
  public user: { id: number, item: MessagesConversationMember, profile: UsersUserFull, info: User };
  public members: { id: number, item: MessagesConversationMember, profile: UsersUserFull, info: User }[];
  public replyMsgSenderId: number;
}
