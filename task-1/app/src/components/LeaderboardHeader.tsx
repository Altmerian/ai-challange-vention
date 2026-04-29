type LeaderboardHeaderProps = {
  title: string;
  subtitle: string;
};

export function LeaderboardHeader({ title, subtitle }: LeaderboardHeaderProps) {
  return (
    <header className="leaderboardHeader">
      <h2 className="leaderboardHeader__title">{title}</h2>
      <p className="leaderboardHeader__subtitle">{subtitle}</p>
    </header>
  );
}
