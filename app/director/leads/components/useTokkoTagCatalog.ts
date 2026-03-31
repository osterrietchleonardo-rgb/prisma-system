import { useState, useEffect } from 'react';
import { TokkoTag } from './tokko-leads-utils';

interface TokkoTagResponse {
  meta: {
    total_count: number;
    next: string | null;
  };
  objects: TokkoTag[];
}

export const useTokkoTagCatalog = (apiKey?: string) => {
  const [tagCatalog, setTagCatalog] = useState<Map<number, TokkoTag>>(new Map());
  const [tagsByGroup, setTagsByGroup] = useState<Record<string, TokkoTag[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchAllTags = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const cached = localStorage.getItem(`tokko_tags_${apiKey || 'proxy'}`);
        const cacheTime = localStorage.getItem(`tokko_tags_time_${apiKey || 'proxy'}`);
        
        if (cached && cacheTime && Date.now() - parseInt(cacheTime) < 5 * 60 * 1000) {
          const parsedTags: TokkoTag[] = JSON.parse(cached);
          const catalog = new Map();
          const groups: Record<string, TokkoTag[]> = {};
          
          parsedTags.forEach(tag => {
            catalog.set(tag.id, tag);
            const group = tag.group_name || 'Sin clasificar';
            if (!groups[group]) groups[group] = [];
            groups[group].push(tag);
          });

          if (isMounted) {
            setTagCatalog(catalog);
            setTagsByGroup(groups);
            setLoading(false);
          }
          return;
        }

        let allTags: TokkoTag[] = [];
        let nextUrl: string | null = `/api/tokko-proxy/contact_tag/?limit=100`;

        while (nextUrl) {
          // Si Tokko devuelve una URL absoluta en 'next', extraer solo el querystring y re-enviar por proxy
          if (nextUrl.startsWith("http")) {
            const urlObj = new URL(nextUrl);
            nextUrl = `/api/tokko-proxy/contact_tag/?${urlObj.searchParams.toString()}`;
          }

          const response = await fetch(nextUrl);
          if (!response.ok) throw new Error('Failed to fetch Tokko tags');
          const data: TokkoTagResponse = await response.json();
          allTags = [...allTags, ...data.objects];
          nextUrl = data.meta?.next || null;
        }

        const catalog = new Map();
        const groups: Record<string, TokkoTag[]> = {};
        
        allTags.forEach(tag => {
          catalog.set(tag.id, tag);
          const group = tag.group_name || 'Sin clasificar';
          if (!groups[group]) groups[group] = [];
          groups[group].push(tag);
        });

        localStorage.setItem(`tokko_tags_${apiKey || 'proxy'}`, JSON.stringify(allTags));
        localStorage.setItem(`tokko_tags_time_${apiKey || 'proxy'}`, Date.now().toString());

        if (isMounted) {
          setTagCatalog(catalog);
          setTagsByGroup(groups);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAllTags();

    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  const getTagName = (id: number) => {
    return tagCatalog.get(id)?.name || 'Desconocido';
  };

  return { tagCatalog, tagsByGroup, getTagName, loading, error };
};
