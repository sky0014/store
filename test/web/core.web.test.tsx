import React, { forwardRef } from "react";
import { makeTest } from "../helper/core.test";

const View = forwardRef((props: any, ref) => {
  const { testID, ...rest } = props;

  const extra: Record<string, any> = {};
  if (testID) {
    extra["data-testid"] = props.testID;
  }

  return <div {...rest} {...extra} ref={ref}></div>;
});

makeTest(View);
