export default function LoadingState({ text, subtext }) {
  return (
    <section className="section">
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <div className="loading-text">{text}</div>
        <div className="loading-subtext">{subtext}</div>
      </div>
    </section>
  );
}
