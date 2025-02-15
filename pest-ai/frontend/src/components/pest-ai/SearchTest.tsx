import React, { useState } from 'react';

const SearchTest = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  const testSearch = async () => {
    const response = await fetch('/api/test_search', {
      method: 'POST',
      body: JSON.stringify({ question: query })
    });
    const data = await response.json();
    setResults(data);
  };

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={testSearch}>Test Search</button>
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </div>
  );
};

export default SearchTest; 