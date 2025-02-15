import React from "react";
import ReactMarkdown from "react-markdown";

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <pre className="prose prose-invert max-w-none font-sans">
      <ReactMarkdown>
        {content}
      </ReactMarkdown>
    </pre>
  );
};

export default MarkdownRenderer; 