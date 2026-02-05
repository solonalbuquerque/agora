export default function PageHeader({ title, onReload, loading }) {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      <button 
        type="button" 
        className="reload-btn" 
        onClick={onReload} 
        disabled={loading}
        title="Reload data"
      >
        {loading ? '...' : '↻'}
      </button>
    </div>
  );
}
