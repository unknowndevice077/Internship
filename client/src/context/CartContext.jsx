import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);
const EMPTY = { items: [], subtotal: 0, count: 0 };

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(EMPTY);

  const isCustomer = user?.role === 'customer';

  const reload = useCallback(async () => {
    if (!isCustomer) return setCart(EMPTY);
    setCart(await api('/cart'));
  }, [isCustomer]);

  useEffect(() => {
    reload().catch(() => setCart(EMPTY));
  }, [reload]);

  const add = async (productId, quantity = 1) =>
    setCart(await api('/cart/items', { method: 'POST', body: { productId, quantity } }));
  const update = async (productId, quantity) =>
    setCart(await api(`/cart/items/${productId}`, { method: 'PUT', body: { quantity } }));
  const remove = async (productId) => setCart(await api(`/cart/items/${productId}`, { method: 'DELETE' }));

  return (
    <CartContext.Provider value={{ cart, reload, add, update, remove, isCustomer }}>{children}</CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
