import { useEffect, useState, useCallback } from 'react';
import { getKitchenOrders } from '../services/orderService';

export const useKitchenOrders = () => {
  const [orders, setOrders] = useState([]);
  const prevOrdersRef = { current: [] };
  const [pendingCount, setPendingCount] = useState(0);
  const [newOrderFlag, setNewOrderFlag] = useState(false);
  const [latestNewOrder, setLatestNewOrder] = useState(null);

  const fetchOrders = async (isBackground = false) => {
    try {
      const data = await getKitchenOrders();
      
      // Determine newly added orders
      if (prevOrdersRef.current.length > 0) {
        const prevIds = prevOrdersRef.current.map((o) => o.id);
        const added = data.filter((o) => !prevIds.includes(o.id));
        if (added.length > 0) {
          setNewOrderFlag(true);
          setLatestNewOrder(added[added.length - 1]);
          setTimeout(() => setNewOrderFlag(false), 1500);
        }
      }

      setOrders(data);
      prevOrdersRef.current = data;
      const pending = data.filter((o) => o.status === 'confirmed' || o.status === 'pending').length;
      setPendingCount(pending);
    } catch (e) {
      console.error('Error fetching kitchen orders for badge', e);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders(true), 5000);
    return () => clearInterval(interval);
  }, []);

  const clearLatestNewOrder = useCallback(() => {
    setLatestNewOrder(null);
  }, []);

  return { pendingCount, newOrderFlag, latestNewOrder, clearLatestNewOrder };
};
