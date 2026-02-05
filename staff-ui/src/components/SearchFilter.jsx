import { useState, useEffect } from 'react';

export default function SearchFilter({ value, onChange, placeholder = 'Search by ID, email, etc.' }) {
  const [inputValue, setInputValue] = useState(value || '');

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onChange(inputValue.trim());
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: '200px' }}
      />
      <button type="submit" className="primary">Search</button>
      {value && (
        <button type="button" onClick={handleClear} style={{ padding: '0.5rem 0.75rem' }}>
          Clear
        </button>
      )}
    </form>
  );
}
