import { StarIcon } from "./icons";

type ScoreDisplayProps = {
  score: number;
  variant?: "row" | "podium";
};

export function ScoreDisplay({ score, variant = "row" }: ScoreDisplayProps) {
  const formatted = score.toLocaleString("en-US");
  return (
    <div className={`scoreDisplay scoreDisplay--${variant}`}>
      {variant === "row" ? (
        <span className="scoreDisplay__label">Total</span>
      ) : null}
      <span className="scoreDisplay__content">
        <StarIcon className="scoreDisplay__icon" width={18} height={18} />
        <span className="scoreDisplay__value">{formatted}</span>
      </span>
    </div>
  );
}
