import React, { useState } from 'react';
import styles from './cardGrid.module.css';
import { Card, type CardConfig } from './Card';

export type { CardConfig };
import { TerminalCard } from './Cards/TerminalCard';
import { WorkTreeCard } from './Cards/WorkTreeCard';
import { BrowserCard } from './Cards/BrowserCard';
import { AgentsCard } from './Cards/AgentsCard';
import { MigrationsCard } from './Cards/MigrationsCard';
import { TasksCard } from './Cards/TasksCard';

interface CardGridProps {
  cards: CardConfig[];
  onRemoveCard: (cardId: string) => void;
  onAddCard: (type: CardConfig['type']) => void;
  expandedCardId?: string | null;
  onExpandCard?: (cardId: string) => void;
  onCollapseCard?: () => void;
}

function getCardComponent(type: CardConfig['type']) {
  switch (type) {
    case 'terminal':
      return TerminalCard;
    case 'worktree':
      return WorkTreeCard;
    case 'browser':
      return BrowserCard;
    case 'agents':
      return AgentsCard;
    case 'migrations':
      return MigrationsCard;
    case 'tasks':
    case 'background-tasks':
      return TasksCard;
    default:
      return null;
  }
}

export function CardGrid({
  cards,
  onRemoveCard,
  onAddCard,
  expandedCardId,
  onExpandCard,
  onCollapseCard,
}: CardGridProps) {
  // If a card is expanded, show it full-page
  if (expandedCardId) {
    const expandedCard = cards.find((c) => c.id === expandedCardId);
    if (expandedCard) {
      const CardComponent = getCardComponent(expandedCard.type);
      if (!CardComponent) return null;

      return (
        <div className={styles.expandedContainer}>
          <div className={styles.expandedHeader}>
            <h2>{expandedCard.title}</h2>
            <button
              className={styles.collapseExpandedButton}
              onClick={() => onCollapseCard?.()}
              title="Back to grid"
            >
              ⊡
            </button>
          </div>
          <div className={styles.expandedContent}>
            <CardComponent card={expandedCard} onRemoveCard={onRemoveCard} />
          </div>
        </div>
      );
    }
  }

  return (
    <div className={styles.cardGrid}>
      {cards.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No cards. Start by adding one:</p>
          <div className={styles.addCardButtons}>
            <button onClick={() => onAddCard('terminal')} className={styles.addCardButton}>
              Terminal
            </button>
            <button onClick={() => onAddCard('worktree')} className={styles.addCardButton}>
              WorkTree
            </button>
            <button onClick={() => onAddCard('browser')} className={styles.addCardButton}>
              Browser
            </button>
            <button onClick={() => onAddCard('agents')} className={styles.addCardButton}>
              Agents
            </button>
            <button onClick={() => onAddCard('migrations')} className={styles.addCardButton}>
              Migrations
            </button>
            <button onClick={() => onAddCard('tasks')} className={styles.addCardButton}>
              Tasks
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.column}>
            {cards.map((card, index) => {
              // Place every other card in column 1
              if (index % 2 !== 0) return null;
              const CardComponent = getCardComponent(card.type);
              if (!CardComponent) return null;

              return (
                <Card
                  key={card.id}
                  card={card}
                  onClose={onRemoveCard}
                  onExpand={(id) => onExpandCard?.(id)}
                >
                  <CardComponent card={card} onRemoveCard={onRemoveCard} />
                </Card>
              );
            })}
          </div>

          <div className={styles.column}>
            {cards.map((card, index) => {
              // Place every other card in column 2
              if (index % 2 === 0) return null;
              const CardComponent = getCardComponent(card.type);
              if (!CardComponent) return null;

              return (
                <Card
                  key={card.id}
                  card={card}
                  onClose={onRemoveCard}
                  onExpand={(id) => onExpandCard?.(id)}
                >
                  <CardComponent card={card} onRemoveCard={onRemoveCard} />
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
