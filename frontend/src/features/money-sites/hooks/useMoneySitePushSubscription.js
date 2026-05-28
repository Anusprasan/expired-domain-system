import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMoneySitePushConfigApi,
  subscribeMoneySitePushApi,
  unsubscribeMoneySitePushApi,
} from "../api/moneySitesApi";

const MONEY_SITE_PUSH_SERVICE_WORKER_PATH = "/money-sites-push-sw.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const safeBase64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(safeBase64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function useMoneySitePushSubscription({
  enabled = true,
  permission = "default",
  onError,
  onSuccess,
} = {}) {
  const [loading, setLoading] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const registrationRef = useRef(null);
  const currentEndpointRef = useRef("");

  const pushSupported = useMemo(
    () =>
      typeof window !== "undefined"
      && "serviceWorker" in window.navigator
      && "PushManager" in window,
    []
  );

  const ensureRegistration = useCallback(async () => {
    if (!enabled || !pushSupported) {
      return null;
    }

    if (registrationRef.current) {
      return registrationRef.current;
    }

    const registration = await window.navigator.serviceWorker.register(
      MONEY_SITE_PUSH_SERVICE_WORKER_PATH
    );
    const readyRegistration = await window.navigator.serviceWorker.ready;
    registrationRef.current = readyRegistration || registration;
    return registrationRef.current;
  }, [enabled, pushSupported]);

  const syncPushSubscription = useCallback(
    async ({ subscribeIfMissing = false, reportErrors = true } = {}) => {
      if (!enabled || !pushSupported || permission !== "granted") {
        setPushSubscribed(false);
        return false;
      }

      setLoading(true);

      try {
        const configResponse = await getMoneySitePushConfigApi();
        const publicKey = String(configResponse?.data?.publicKey || "").trim();
        const configured = Boolean(configResponse?.data?.enabled && publicKey);

        setPushConfigured(configured);

        if (!configured) {
          setPushSubscribed(false);
          if (reportErrors) {
            onError?.("Web push notifications are not configured on the server.");
          }
          return false;
        }

        const registration = await ensureRegistration();

        if (!registration?.pushManager) {
          setPushSubscribed(false);
          if (reportErrors) {
            onError?.("Push manager is not available in this browser.");
          }
          return false;
        }

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription && subscribeIfMissing) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        if (!subscription) {
          currentEndpointRef.current = "";
          setPushSubscribed(false);
          return false;
        }

        currentEndpointRef.current = subscription.endpoint;

        await subscribeMoneySitePushApi({
          ...subscription.toJSON(),
          userAgent: window.navigator.userAgent,
        });

        setPushSubscribed(true);
        return true;
      } catch (error) {
        setPushSubscribed(false);
        if (reportErrors) {
          onError?.(error?.response?.data?.message || "Failed to enable background push notifications.");
        }
        return false;
      } finally {
        setLoading(false);
      }
    },
    [enabled, ensureRegistration, onError, permission, pushSupported]
  );

  const unsubscribePushSubscription = useCallback(async () => {
    if (!pushSupported) {
      setPushSubscribed(false);
      return;
    }

    setLoading(true);

    try {
      const registration = await ensureRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      const endpoint = subscription?.endpoint || currentEndpointRef.current;

      if (endpoint) {
        await unsubscribeMoneySitePushApi({ endpoint });
      }

      if (subscription) {
        await subscription.unsubscribe();
      }

      currentEndpointRef.current = "";
      setPushSubscribed(false);
      onSuccess?.("Background push notifications disabled.");
    } catch (error) {
      onError?.(error?.response?.data?.message || "Failed to disable background push notifications.");
    } finally {
      setLoading(false);
    }
  }, [ensureRegistration, onError, onSuccess, pushSupported]);

  useEffect(() => {
    if (!enabled || permission !== "granted") {
      setPushSubscribed(false);
      return;
    }

    void syncPushSubscription({ subscribeIfMissing: true, reportErrors: false });
  }, [enabled, permission, syncPushSubscription]);

  return {
    pushSupported,
    pushConfigured,
    pushSubscribed,
    pushLoading: loading,
    syncPushSubscription,
    unsubscribePushSubscription,
  };
}
