import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "novoriq.onboarding.dismissed";

export function useOnboardingTips() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const dismissed = await AsyncStorage.getItem(KEY);
      if (!dismissed && active) {
        setVisible(true);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const dismiss = async () => {
    await AsyncStorage.setItem(KEY, "true");
    setVisible(false);
  };

  return { visible, dismiss };
}
