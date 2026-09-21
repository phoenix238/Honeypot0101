import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { AnswerResult, Meta, PublicQuestion, Round } from '../types.ts';
import { Sources } from './Sources.tsx';

interface Props {
  round: Round;
  meta: Meta;
  onFinish: () => void;
}

export function Quiz({ round, meta, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const question: PublicQuestion | undefined = round.questions[index];
  // Reset per question rather than per render, so the speed bonus measures how
  // long this question was on screen.
  const shownAt = useRef(Date.now());
  useEffect(() => {
    shownAt.current = Date.now();
    setResult(null);
    setNote(null);
    setError(null);
  }, [index]);

  if (!question) return null;

  async function choose(choiceId: string) {
    if (result || pending || !question) return;
    setPending(true);
    setError(null);
    try {
      const answer = await api.answer(
        round.roundId,
        question.id,
        choiceId,
        Date.now() - shownAt.current,
      );
      setResult(answer);
      setScore(answer.totalScore);
      setStreak(answer.streak);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit that answer.');
    } finally {
      setPending(false);
    }
  }

  async function askClaude() {
    if (!question || noteBusy) return;
    setNoteBusy(true);
    setError(null);
    try {
      const { text } = await api.explain(round.roundId, question.id);
      setNote(text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not fetch a note.');
    } finally {
      setNoteBusy(false);
    }
  }

  const isLast = index === round.questions.length - 1;
  const chosenId = result
    ? question.choices.find((c) => c.id === result.correctChoiceId)?.id
    : undefined;

  return (
    <div className="card quiz">
      <div className="quiz-bar">
        <span className="progress">
          Question {index + 1} of {round.questions.length}
        </span>
        <span className={`badge badge-${question.difficulty}`}>{question.difficulty}</span>
        <span className="score">
          {score} pts{streak > 1 ? <em> · {streak} in a row</em> : null}
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={round.questions.length}
      >
        <div
          className="progress-fill"
          style={{ width: `${((index + (result ? 1 : 0)) / round.questions.length) * 100}%` }}
        />
      </div>

      <h2 className="prompt">{question.prompt}</h2>

      <div className="choices">
        {question.choices.map((choice) => {
          const isCorrect = result && choice.id === result.correctChoiceId;
          const isWrongPick = result && !result.correct && choice.id !== result.correctChoiceId;
          return (
            <button
              key={choice.id}
              type="button"
              className={[
                'choice',
                isCorrect ? 'choice-correct' : '',
                result && isWrongPick ? 'choice-dim' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!!result || pending}
              onClick={() => choose(choice.id)}
            >
              {choice.flag ? <span className="choice-flag">{choice.flag}</span> : null}
              <span className="choice-label">{choice.label}</span>
              {choice.sublabel ? <span className="choice-sub">{choice.sublabel}</span> : null}
            </button>
          );
        })}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {result ? (
        <div className={`verdict ${result.correct ? 'verdict-right' : 'verdict-wrong'}`}>
          <p className="verdict-headline">
            {result.correct
              ? `Correct — +${result.pointsAwarded} points`
              : `Not quite — the answer was ${
                  question.choices.find((c) => c.id === chosenId)?.label ?? ''
                }`}
          </p>
          {result.explanation.split('\n\n').map((paragraph, i) => (
            <p key={i} className="explanation">
              {paragraph}
            </p>
          ))}

          <Sources sources={result.sources} />

          {meta.explainer.available ? (
            <div className="claude">
              {note ? (
                <>
                  <p className="claude-note">{note}</p>
                  <p className="claude-caveat">
                    Written by Claude from the sourced facts above — a memory hook, not an
                    extra source.
                  </p>
                </>
              ) : (
                <button type="button" className="ghost" disabled={noteBusy} onClick={askClaude}>
                  {noteBusy ? 'Thinking…' : 'Ask Claude for a way to remember this'}
                </button>
              )}
            </div>
          ) : null}

          <button
            type="button"
            className="primary"
            onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
          >
            {isLast ? 'See how you did' : 'Next question'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
