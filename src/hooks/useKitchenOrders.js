import { useEffect, useState, useCallback } from 'react';
import { getKitchenOrders } from '../services/orderService';

// Shared module-level state & subscribers
let prevOrders = [];
let globalPendingCount = 0;
let globalNewOrderFlag = false;
let globalLatestNewOrder = null;
const subscribers = new Set();
let timerId = null;

const notifySubscribers = () => {
  subscribers.forEach((callback) => callback());
};

const fetchOrders = async () => {
  try {
    const data = await getKitchenOrders();

    if (prevOrders.length > 0) {
      const prevIds = prevOrders.map((o) => o.id);
      const added = data.filter((o) => !prevIds.includes(o.id));
      if (added.length > 0) {
        globalNewOrderFlag = true;
        globalLatestNewOrder = added[added.length - 1];
        setTimeout(() => {
          globalNewOrderFlag = false;
          notifySubscribers();
        }, 1500);
      }
    }

    prevOrders = data;
    globalPendingCount = data.filter((o) => o.status === 'confirmed' || o.status === 'pending').length;
    notifySubscribers();
  } catch (e) {
    console.error('Error fetching kitchen orders for badge', e);
  }
};

const startGlobalTimer = () => {
  if (!timerId) {
    fetchOrders();
    timerId = setInterval(fetchOrders, 15000); // Shared 15-second polling timer
  }
};

const stopGlobalTimer = () => {
  if (subscribers.size === 0 && timerId) {
    clearInterval(timerId);
    timerId = null;
  }
};

export const useKitchenOrders = () => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const callback = () => setTick((t) => t + 1);
    subscribers.add(callback);
    startGlobalTimer();

    return () => {
      subscribers.delete(callback);
      stopGlobalTimer();
    };
  }, []);

  const clearLatestNewOrder = useCallback(() => {
    globalLatestNewOrder = null;
    notifySubscribers();
  }, []);

  return {
    pendingCount: globalPendingCount,
    newOrderFlag: globalNewOrderFlag,
    latestNewOrder: globalLatestNewOrder,
    clearLatestNewOrder,
  };
};

