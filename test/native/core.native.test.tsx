import { Button, View } from "react-native";
import { makeTest } from "../helper/core.test";
import React from "react";

function Component(props: any) {
  const { onClick, ...rest } = props;

  if (onClick) {
    return <Button {...rest} onPress={onClick} title={props.children} />;
  }

  return <View {...props} />;
}

makeTest(Component, true);
