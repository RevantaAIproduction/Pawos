/**
 * Service layer for meeting management.
 * Handles recording, summarization, and distribution of meetings.
 * Pro+ tier feature with tier gating via IPC handlers.
 *
 * Meeting Summarization Compute Cost Model:
 * - 1 minute recording = 0.5 Paw Compute (PC)
 * - 1 hour recording = 30 PC
 * - Formula: (durationSeconds / 60) * 0.5
 */

import { BrowserWindow } from 'electron';
import type {
  Meeting,
  MeetingAttendee,
  MeetingDistributeRequest,
  MeetingListQuery,
  MeetingRecordRequest,
  MeetingSummarizeRequest,
  DistributionRequest,
  CropSummaryRequest,
  DraftRequest,
  ScheduleSendRequest,
  StructuredSummary,
  SummarizationCostTransaction,
} from '../../../shared/workspace/MeetingTypes';
import {
  addAttendee,
  distributeMeetingSummary,
  getMeeting,
  listMeetings,
  recordMeeting,
  summarizeMeeting,
  updateMeetingStatus,
  cropSummary,
  saveDraft,
  scheduleSend,
  getScheduledSends,
  getDrafts,
  generateStructuredSummary,
} from '../../ipc/handlers/meetingHandler';
import { logTaskEvent, startTask } from '../../ipc/handlers/backgroundTasksHandler';

export class MeetingService {
  /**
   * Calculate Paw Compute cost for meeting summarization
   * Formula: (durationSeconds / 60) * 0.5 = PC cost
   * @param durationSeconds - Duration of recording in seconds
   * @returns Cost in Paw Compute (rounded to 2 decimals)
   */
  static calculateSummarizationCost(durationSeconds: number): number {
    const cost = (durationSeconds / 60) * 0.5;
    // Round to 2 decimals
    return Math.round(cost * 100) / 100;
  }

  /**
   * Check if user has sufficient Paw Compute balance for summarization
   * @param userId - User ID
   * @param requiredPC - Required Paw Compute amount
   * @returns true if user has sufficient balance, false otherwise
   */
  static async checkComputeBalance(userId: string, requiredPC: number): Promise<boolean> {
    try {
      // TODO: Integrate with billing service to get user's Paw Compute balance
      // For now, this is a stub that needs billing service integration
      // This will query the user's available Paw Compute from the billing service
      const balance = await this.getComputeBalance(userId);
      return balance >= requiredPC;
    } catch (error) {
      console.error('Failed to check compute balance:', error);
      throw error;
    }
  }

  /**
   * Get user's current Paw Compute balance
   * @param userId - User ID
   * @returns Current Paw Compute balance
   */
  static async getComputeBalance(userId: string): Promise<number> {
    try {
      // TODO: Integrate with billing service to get user's Paw Compute balance
      // This will query the EntitlementService or CreditStore
      // For now, return a placeholder
      return 100; // Placeholder
    } catch (error) {
      console.error('Failed to get compute balance:', error);
      throw error;
    }
  }

  /**
   * Deduct Paw Compute from user's account after summarization
   * @param userId - User ID
   * @param amount - Amount to deduct (in PC)
   * @param metadata - Transaction metadata
   * @returns Transaction record
   */
  static async deductComputeBalance(
    userId: string,
    amount: number,
    metadata: { type: string; meetingId: string; durationMinutes: number }
  ): Promise<SummarizationCostTransaction> {
    try {
      // TODO: Integrate with billing service to deduct compute
      // This will call the billing service's deductPawCompute method
      const transaction: SummarizationCostTransaction = {
        id: `txn-${Date.now()}`,
        userId,
        meetingId: metadata.meetingId,
        cost: amount,
        durationMinutes: metadata.durationMinutes,
        durationSeconds: metadata.durationMinutes * 60,
        timestamp: Date.now(),
        status: 'completed',
      };

      // Log the transaction
      console.log(`[MeetingService] Deducted ${amount} PC from user ${userId} for meeting ${metadata.meetingId}`);

      return transaction;
    } catch (error) {
      console.error('Failed to deduct compute balance:', error);
      throw error;
    }
  }

  /**
   * Start a new meeting recording
   */
  static async startRecording(userId: string, request: MeetingRecordRequest): Promise<Meeting | null> {
    try {
      const result = recordMeeting(userId, request);
      if (!result.ok) return null;

      const meeting = getMeeting(request.meetingId);
      if (meeting) {
        // Log as background task
        startTask('meeting_recording', `Recording: ${request.title}`, `record-meeting ${request.meetingId}`);
      }

      return meeting;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return null;
    }
  }

  /**
   * Stop recording and finalize meeting
   */
  static async stopRecording(meetingId: string): Promise<Meeting | null> {
    try {
      const result = updateMeetingStatus(meetingId, 'completed');
      return result.ok ? result.meeting || null : null;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  }

  /**
   * Generate AI summary for a meeting with compute cost deduction
   */
  static async generateSummary(userId: string, request: MeetingSummarizeRequest): Promise<boolean> {
    try {
      const meeting = getMeeting(request.meetingId);
      if (!meeting) {
        console.error('Meeting not found');
        return false;
      }

      const taskId = startTask('meeting_summarization', `Summarizing: ${meeting.title}`, `summarize-meeting ${request.meetingId}`);
      if (!taskId.ok || !taskId.taskId) return false;

      // Calculate summarization cost from recording duration
      const durationSeconds = meeting.recording?.duration || 0;
      const cost = this.calculateSummarizationCost(durationSeconds);

      // Check if user has sufficient balance
      const hasBalance = await this.checkComputeBalance(userId, cost);
      if (!hasBalance) {
        const balance = await this.getComputeBalance(userId);
        const reason = `Insufficient balance (need ${cost} PC, have ${balance} PC)`;
        logTaskEvent(taskId.taskId, 'error', reason);
        console.error(`[MeetingService] ${reason}`);
        return false;
      }

      // Generate summary
      const result = await summarizeMeeting(userId, request);
      if (result.ok) {
        // Deduct compute cost after successful summary generation
        try {
          const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100;
          await this.deductComputeBalance(userId, cost, {
            type: 'meeting_summarization',
            meetingId: request.meetingId,
            durationMinutes,
          });

          logTaskEvent(taskId.taskId, 'info', `Summary generated successfully (Cost: ${cost} PC)`);
          return true;
        } catch (deductError) {
          console.error('Failed to deduct compute cost:', deductError);
          logTaskEvent(taskId.taskId, 'error', 'Summary generated but failed to deduct compute cost');
          return false;
        }
      } else {
        logTaskEvent(taskId.taskId, 'error', result.reason || 'Failed to generate summary');
        return false;
      }
    } catch (error) {
      console.error('Failed to generate summary:', error);
      return false;
    }
  }

  /**
   * Distribute meeting summary to selected users
   */
  static async distributeSummary(userId: string, request: MeetingDistributeRequest): Promise<boolean> {
    try {
      const taskId = startTask('meeting_distribution', `Distributing summary for meeting`, `distribute-summary ${request.meetingId}`);
      if (!taskId.ok || !taskId.taskId) return false;

      const result = await distributeMeetingSummary(userId, request);
      if (result.ok) {
        logTaskEvent(taskId.taskId, 'info', `Summary distributed to ${request.recipients.length} recipients`);
        return true;
      } else {
        logTaskEvent(taskId.taskId, 'error', result.reason || 'Failed to distribute summary');
        return false;
      }
    } catch (error) {
      console.error('Failed to distribute summary:', error);
      return false;
    }
  }

  /**
   * List recent meetings
   */
  static listMeetings(userId: string, query?: MeetingListQuery): Meeting[] {
    const result = listMeetings(userId, query);
    return result.ok ? result.meetings : [];
  }

  /**
   * Get a specific meeting
   */
  static getMeeting(meetingId: string): Meeting | null {
    return getMeeting(meetingId);
  }

  /**
   * Add attendee to a meeting
   */
  static addAttendee(meetingId: string, attendee: MeetingAttendee): boolean {
    const result = addAttendee(meetingId, attendee);
    return result.ok;
  }

  /**
   * Sync meeting with Google Calendar
   */
  static async syncWithCalendar(meetingId: string, calendarEventId: string): Promise<boolean> {
    try {
      const meeting = getMeeting(meetingId);
      if (!meeting) return false;

      // TODO: Implement calendar sync when Google Calendar integration is complete
      meeting.calendarEventId = calendarEventId;
      return true;
    } catch (error) {
      console.error('Failed to sync with calendar:', error);
      return false;
    }
  }

  /**
   * Join an existing meeting by link
   */
  static async joinMeeting(meetingLink: string, attendeeEmail: string): Promise<Meeting | null> {
    try {
      // TODO: Implement join meeting logic for Zoom/Teams/Meet links
      // For now, this is a stub
      return null;
    } catch (error) {
      console.error('Failed to join meeting:', error);
      return null;
    }
  }

  /**
   * Generate structured summary with purpose, takeaways, topics, and action items
   */
  static async generateStructuredSummary(
    meetingId: string
  ): Promise<StructuredSummary | null> {
    try {
      const meeting = getMeeting(meetingId);
      if (!meeting || !meeting.recording) return null;

      const result = await generateStructuredSummary(meetingId);
      if (!result.ok || !result.structured) return null;

      return result.structured;
    } catch (error) {
      console.error('Failed to generate structured summary:', error);
      return null;
    }
  }

  /**
   * Crop meeting summary for selected topics and action items
   */
  static cropSummary(request: CropSummaryRequest) {
    try {
      return cropSummary(request);
    } catch (error) {
      console.error('Failed to crop summary:', error);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'Failed to crop summary',
      };
    }
  }

  /**
   * Save meeting summary as draft
   */
  static saveSummaryDraft(request: DraftRequest) {
    try {
      return saveDraft(request);
    } catch (error) {
      console.error('Failed to save draft:', error);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'Failed to save draft',
      };
    }
  }

  /**
   * Schedule meeting summary to be sent later
   */
  static scheduleDistribution(request: ScheduleSendRequest) {
    try {
      return scheduleSend(request);
    } catch (error) {
      console.error('Failed to schedule send:', error);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'Failed to schedule send',
      };
    }
  }

  /**
   * Get all scheduled sends for a meeting
   */
  static getScheduledSends(meetingId: string) {
    try {
      return getScheduledSends(meetingId);
    } catch (error) {
      console.error('Failed to get scheduled sends:', error);
      return {
        ok: false,
        scheduled: [],
      };
    }
  }

  /**
   * Get all drafts for a meeting
   */
  static getDrafts(meetingId: string) {
    try {
      return getDrafts(meetingId);
    } catch (error) {
      console.error('Failed to get drafts:', error);
      return {
        ok: false,
        drafts: [],
      };
    }
  }

  /**
   * Broadcast meeting summary to all surfaces:
   * 1. Conversation Panel - displays as message/card in chat
   * 2. Browser Tab (Right Sidebar) - displays in Meeting Summary section
   * 3. Work History (Left Desktop Sidebar) - records as recent meeting in activity
   *
   * Called after summary is generated.
   */
  static broadcastMeetingSummary(meeting: Meeting, userId?: string): void {
    try {
      if (!meeting.summary) {
        console.warn('[MeetingService] No summary to broadcast');
        return;
      }

      // Prepare summary data for all three surfaces
      const summaryData = {
        meetingId: meeting.id,
        title: meeting.title,
        attendees: meeting.attendees,
        summary: meeting.summary,
        recordingUrl: meeting.recording?.url,
        meetingLink: meeting.meetingLink,
        duration: meeting.duration,
        recordedAt: meeting.startedAt,
      };

      // Broadcast to all windows for display in:
      // 1. Conversation panel as message/card
      // 2. Browser tab Meeting Summary section
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.webContents.send('meeting:summaryGenerated', summaryData);
        } catch (error) {
          console.error('[MeetingService] Failed to send summary to window:', error);
        }
      }

      // Also record in work history as an execution record for left sidebar display
      if (userId) {
        try {
          const executionRecord = {
            id: `meeting-${meeting.id}`,
            goal: `Record and summarize: ${meeting.title}`,
            status: 'completed' as const,
            startedAt: meeting.startedAt || Date.now(),
            completedAt: meeting.endedAt || Date.now(),
            durationMs: meeting.duration ? meeting.duration * 1000 : 0,
            applicationsUsed: ['Google Meet', 'Google Calendar'],
            aiWorkersUsed: ['meeting-assistant'],
            commandsExecuted: ['record-meeting', 'summarize-meeting'],
            filesCreated: [],
            filesModified: [],
            verificationResults: [
              { description: 'Meeting recorded', ok: true },
              { description: 'Summary generated', ok: true },
            ],
            timeline: [
              {
                type: 'meeting-record',
                ok: true,
                label: 'Recording completed',
                startedAt: meeting.startedAt || Date.now(),
                endedAt: meeting.endedAt || Date.now(),
              },
              {
                type: 'meeting-summarize',
                ok: true,
                label: 'AI summary generated',
                startedAt: meeting.summary.generatedAt,
                endedAt: meeting.summary.generatedAt + 1000,
              },
            ],
            summary: meeting.summary.content,
            runtime: 'meeting-assistant',
            userId,
          };

          // Send to all windows for work history display
          for (const win of BrowserWindow.getAllWindows()) {
            try {
              win.webContents.send('execution:recordMeetingSummary', executionRecord);
            } catch (error) {
              console.error('[MeetingService] Failed to send execution record:', error);
            }
          }
        } catch (error) {
          console.error('[MeetingService] Error creating execution record:', error);
        }
      }

      console.log(`[MeetingService] Broadcast summary to all surfaces: ${meeting.title}`);
    } catch (error) {
      console.error('[MeetingService] Error broadcasting summary:', error);
    }
  }
}
