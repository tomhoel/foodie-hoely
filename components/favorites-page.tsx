'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Trash2 } from 'lucide-react';
import { CUISINE_COLORS } from '@/lib/dishes';

interface FavoriteEntry {
  cacheKey: string;
  dishName: string;
  image: string;
  cuisine: string;
  savedAt: string;
}

function getFavorites(): FavoriteEntry[] {
  try { return JSON.parse(localStorage.getItem('recipe-favorites') || '[]'); } catch { return []; }
}

function removeFavorite(dishName: string) {
  const favs = getFavorites().filter((f) => f.dishName.toLowerCase() !== dishName.toLowerCase());
  localStorage.setItem('recipe-favorites', JSON.stringify(favs));
}

export function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  function handleRemove(dishName: string) {
    removeFavorite(dishName);
    setFavorites(getFavorites());
  }

  function navigateToDish(fav: FavoriteEntry) {
    const params = new URLSearchParams({ dish: fav.dishName, img: fav.image, cuisine: fav.cuisine });
    router.push(`/recipe?${params.toString()}`);
  }

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <Heart className="size-5 text-orange-500" fill="currentColor" />
          <h1 className="text-xl font-semibold text-foreground">Favorites</h1>
        </div>

        {favorites.length === 0 ? (
          <div className="py-16 text-center">
            <Heart className="size-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No saved recipes yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Tap the heart on any recipe to save it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {favorites.map((fav) => (
              <div key={fav.cacheKey} className="group relative">
                <button
                  type="button"
                  onClick={() => navigateToDish(fav)}
                  className="w-full text-left cursor-pointer"
                >
                  {fav.image ? (
                    <img
                      src={fav.image.startsWith('http') || fav.image.startsWith('/') ? fav.image : '/' + fav.image}
                      alt={fav.dishName}
                      className="aspect-square w-full rounded-xl object-cover bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="aspect-square w-full rounded-xl flex items-center justify-center text-white text-lg font-bold"
                      style={{ backgroundColor: CUISINE_COLORS[fav.cuisine] || CUISINE_COLORS.default }}
                    >
                      {fav.dishName.charAt(0)}
                    </div>
                  )}
                  <div className="mt-2">
                    <div className="text-sm font-medium text-foreground truncate">{fav.dishName}</div>
                    {fav.cuisine && (
                      <div className="text-xs text-muted-foreground">{fav.cuisine}</div>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(fav.dishName)}
                  className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  aria-label={`Remove ${fav.dishName} from favorites`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
