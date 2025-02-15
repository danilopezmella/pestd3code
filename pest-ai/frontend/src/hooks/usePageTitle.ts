import { useEffect } from 'react';

export const usePageTitle = (title: string, description?: string) => {
  useEffect(() => {
    // Update the document title
    document.title = title;

    // Update meta description if provided
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && description) {
      metaDescription.setAttribute('content', description);
    }
  }, [title, description]);
}; 