import { SearchPage } from '@/components/search-page';
import { generateDescriptions } from '@/lib/describe';

export default async function Home() {
  const descriptions = await generateDescriptions();
  return <SearchPage descriptions={descriptions} />;
}
