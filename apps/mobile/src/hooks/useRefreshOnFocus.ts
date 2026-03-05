import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";

export function useRefreshOnFocus(callback: () => void | Promise<void>) {
  useFocusEffect(
    useCallback(() => {
      callback();
    }, [callback])
  );
}
