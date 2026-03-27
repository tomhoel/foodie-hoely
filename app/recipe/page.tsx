import { Suspense } from 'react';
import { RecipePage } from '@/components/recipe-page';

export default function Recipe() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <RecipePage />
    </Suspense>
  );
}
