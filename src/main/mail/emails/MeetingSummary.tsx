import * as React from 'react';
import { Text, Hr } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';
import type { MeetingSummary } from '../../../shared/workspace/MeetingTypes';

export interface MeetingSummaryEmailProps extends BrandingProps {
  meetingTitle: string;
  organizerName: string;
  meetingDate: string;
  summary: MeetingSummary;
  recipientName?: string;
}

export function MeetingSummaryEmail({
  meetingTitle,
  organizerName,
  meetingDate,
  summary,
  recipientName = 'there',
  logoFullSrc,
  logoIconSrc,
}: MeetingSummaryEmailProps) {
  return (
    <EmailLayout
      previewText={`Meeting summary: ${meetingTitle}`}
      logoFullSrc={logoFullSrc}
      logoIconSrc={logoIconSrc}
    >
      <Card>
        <Text
          style={{
            textAlign: 'center',
            fontFamily: theme.font,
            fontSize: 18,
            fontWeight: 700,
            color: theme.colors.text,
            margin: '0 0 10px',
          }}
        >
          Meeting Summary
        </Text>
        <Text
          style={{
            textAlign: 'left',
            fontFamily: theme.font,
            fontSize: 13.5,
            color: theme.colors.textMuted,
            margin: '0 0 20px',
            lineHeight: 1.6,
          }}
        >
          Hi {recipientName},
        </Text>

        {/* Meeting details */}
        <div style={{ backgroundColor: theme.colors.surface, padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
          <Text
            style={{
              fontFamily: theme.font,
              fontSize: 13,
              color: theme.colors.text,
              margin: '0 0 4px',
              fontWeight: 600,
            }}
          >
            {meetingTitle}
          </Text>
          <Text
            style={{
              fontFamily: theme.font,
              fontSize: 12,
              color: theme.colors.textMuted,
              margin: '0',
            }}
          >
            Organized by {organizerName} • {meetingDate}
          </Text>
        </div>

        {/* Summary content */}
        <Text
          style={{
            fontFamily: theme.font,
            fontSize: 13.5,
            color: theme.colors.text,
            margin: '0 0 12px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
          }}
        >
          {summary.content}
        </Text>

        {/* Key points */}
        {summary.keyPoints && summary.keyPoints.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <Text
              style={{
                fontFamily: theme.font,
                fontSize: 14,
                fontWeight: 600,
                color: theme.colors.text,
                margin: '0 0 8px',
              }}
            >
              Key Points
            </Text>
            {summary.keyPoints.map((point, idx) => (
              <Text
                key={idx}
                style={{
                  fontFamily: theme.font,
                  fontSize: 13,
                  color: theme.colors.textMuted,
                  margin: '4px 0',
                  lineHeight: 1.5,
                  paddingLeft: '12px',
                  borderLeft: `2px solid ${theme.colors.border}`,
                }}
              >
                • {point}
              </Text>
            ))}
          </div>
        )}

        {/* Action items */}
        {summary.actionItems && summary.actionItems.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <Text
              style={{
                fontFamily: theme.font,
                fontSize: 14,
                fontWeight: 600,
                color: theme.colors.text,
                margin: '0 0 8px',
              }}
            >
              Action Items
            </Text>
            {summary.actionItems.map((item, idx) => (
              <Text
                key={idx}
                style={{
                  fontFamily: theme.font,
                  fontSize: 13,
                  color: theme.colors.textMuted,
                  margin: '4px 0',
                  lineHeight: 1.5,
                  paddingLeft: '12px',
                  borderLeft: `2px solid ${theme.colors.border}`,
                }}
              >
                ☐ {item}
              </Text>
            ))}
          </div>
        )}

        {/* Decisions */}
        {summary.decisions && summary.decisions.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <Text
              style={{
                fontFamily: theme.font,
                fontSize: 14,
                fontWeight: 600,
                color: theme.colors.text,
                margin: '0 0 8px',
              }}
            >
              Decisions
            </Text>
            {summary.decisions.map((decision, idx) => (
              <Text
                key={idx}
                style={{
                  fontFamily: theme.font,
                  fontSize: 13,
                  color: theme.colors.textMuted,
                  margin: '4px 0',
                  lineHeight: 1.5,
                  paddingLeft: '12px',
                  borderLeft: `2px solid ${theme.colors.border}`,
                }}
              >
                ✓ {decision}
              </Text>
            ))}
          </div>
        )}

        <Hr style={{ borderColor: theme.colors.border, margin: '20px 0' }} />

        <Text
          style={{
            textAlign: 'center',
            fontFamily: theme.font,
            fontSize: 12,
            color: theme.colors.textFaint,
            margin: '0',
          }}
        >
          Generated by PawOS Meeting Assistant
        </Text>
      </Card>
    </EmailLayout>
  );
}
