import { Button, View } from "react-native";
import { makeTest } from "../helper/core.test";
import React, { forwardRef } from "react";

const Component = forwardRef((props: any, ref) => {
  const { onClick, ...rest } = props;

  if (onClick) {
    return (
      <Button {...rest} onPress={onClick} title={props.children} ref={ref} />
    );
  }

  return <View {...props} ref={ref} />;
});

makeTest(Component, true);
