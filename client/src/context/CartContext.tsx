import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Cart } from '../types';
import { useAuth } from './AuthContext';

interface CartValue {
  cart: Cart;
  reload: () => Promise<void>;
  add: (productId: string, quantity?: number) => Promise<void>;
  update: (productId: string, quantity: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  isCustomer: boolean;
}

const CartContext = createContext<CartValue | null>(null);
const EMPTY: Cart = { items: [], subtotal: 0, count: 0 };

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>(EMPTY);

  const isCustomer = user?.role === 'customer';

  const reload = useCallback(async () => {
    setCart(isCustomer ? await api<Cart>('/cart') : EMPTY);
  }, [isCustomer]);

  useEffect(() => {
    reload().catch(() => setCart(EMPTY));
  }, [reload]);

  const add = async (productId: string, quantity = 1) =>
    setCart(await api<Cart>('/cart/items', { method: 'POST', body: { productId, quantity } }));
  const update = async (productId: string, quantity: number) =>
    setCart(await api<Cart>(`/cart/items/${productId}`, { method: 'PUT', body: { quantity } }));
  const remove = async (productId: string) =>
    setCart(await api<Cart>(`/cart/items/${productId}`, { method: 'DELETE' }));

  return (
    <CartContext.Provider value={{ cart, reload, add, update, remove, isCustomer }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
