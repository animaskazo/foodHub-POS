import { useEffect, useState, useCallback } from 'react';
import { getKitchenOrders } from '../services/orderService';
import { supabase } from '../lib/supabase';

// Shared module-level state & subscribers
let prevOrders = [];
let isInitialized = false;
let globalPendingCount = 0;
let globalNewOrderFlag = false;
let globalLatestNewOrder = null;
const subscribers = new Set();
let timerId = null;
let realtimeChannel = null;

const notifySubscribers = () => {
  subscribers.forEach((callback) => callback());
};

export const fetchOrders = async () => {
  try {
    const data = await getKitchenOrders();

    if (isInitialized) {
      const prevIds = new Set(prevOrders.map((o) => o.id));
      // Detect newly arrived orders in pending/confirmed/scheduled status
      const added = data.filter(
        (o) => !prevIds.has(o.id) && (o.status === 'confirmed' || o.status === 'pending' || o.status === 'scheduled')
      );
      if (added.length > 0) {
        globalNewOrderFlag = true;
        globalLatestNewOrder = added[added.length - 1];
        setTimeout(() => {
          globalNewOrderFlag = false;
          notifySubscribers();
        }, 3000);
      }
    } else {
      isInitialized = true;
    }

    prevOrders = data;
    globalPendingCount = data.filter((o) => o.status === 'confirmed' || o.status === 'pending').length;
    notifySubscribers();
  } catch (e) {
    console.error('Error fetching kitchen orders for badge', e);
  }
};

const startRealtime = () => {
  if (!realtimeChannel) {
    realtimeChannel = supabase
      .channel('global-kitchen-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // Immediately fetch when any order is created or updated
          fetchOrders();
        }
      )
      .subscribe();
  }
};

const stopRealtime = () => {
  if (subscribers.size === 0 && realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
};

const startGlobalTimer = () => {
  if (!timerId) {
    fetchOrders();
    timerId = setInterval(fetchOrders, 12000); // 12-second polling fallback
  }
  startRealtime();
};

const stopGlobalTimer = () => {
  if (subscribers.size === 0) {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    stopRealtime();
    isInitialized = false;
    prevOrders = [];
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
    refetch: fetchOrders,
  };
};

