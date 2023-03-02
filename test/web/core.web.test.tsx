import React from "react";
import { makeTest } from "../helper/core.test";

function View(props: any) {
  const { testID, ...rest } = props;

  const extra: Record<string, any> = {};
  if (testID) {
    extra["data-testid"] = props.testID;
  }

  return <div {...rest} {...extra}></div>;
}

makeTest(View);
