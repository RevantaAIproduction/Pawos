import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { randomUUID } from 'crypto';
import type { SupportConversation, SupportConversationStatus, SupportConversationTurn } from './SupportConversationTypes';

const FILE_NAME = 'support-conversations.json';

class SupportConversationStore {
  private file = '';
  private conversations: SupportConversation[] = [];

  init(): void {
    this.file = path.join(app.getPath('userData'), 'help', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      this.conversations = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      this.conversations = [];
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.conversations, null, 2), 'utf-8');
  }

  list(): SupportConversation[] {
    return this.conversations;
  }

  get(id: string): SupportConversation | undefined {
    return this.conversations.find((c) => c.id === id);
  }

  create(problemSummary: string): SupportConversation {
    const conversation: SupportConversation = {
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      problemSummary,
      status: 'new',
      diagnosis: '',
      actionsTaken: [],
      currentState: 'Waiting for AI to review the problem.',
      needsPermission: false,
      turns: [],
    };
    this.conversations = [conversation, ...this.conversations];
    this.save();
    return conversation;
  }

  addTurn(id: string, turn: SupportConversationTurn): SupportConversation | undefined {
    const conversation = this.get(id);
    if (!conversation) return undefined;
    conversation.turns = [...conversation.turns, turn];
    conversation.updatedAt = Date.now();
    this.save();
    return conversation;
  }

  update(
    id: string,
    patch: Partial<Pick<SupportConversation, 'status' | 'diagnosis' | 'currentState' | 'needsPermission' | 'actionsTaken'>>
  ): SupportConversation | undefined {
    const conversation = this.get(id);
    if (!conversation) return undefined;
    Object.assign(conversation, patch, { updatedAt: Date.now() });
    this.save();
    return conversation;
  }

  setRating(id: string, rating: 'up' | 'down', negativeFeedbackDetail?: string): SupportConversation | undefined {
    const conversation = this.get(id);
    if (!conversation) return undefined;
    conversation.supportRating = rating;
    if (negativeFeedbackDetail) conversation.negativeFeedbackDetail = negativeFeedbackDetail;
    conversation.updatedAt = Date.now();
    this.save();
    return conversation;
  }
}

export const supportConversationStore = new SupportConversationStore();
export type { SupportConversationStatus };
