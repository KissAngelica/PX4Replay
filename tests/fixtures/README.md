# Test fixtures

只允许提交人工生成或完成脱敏的小型飞行数据 Fixture。

真实 `.ulg` 可能包含 GPS 坐标、设备标识和任务信息，工程通过根目录 `.gitignore` 默认忽略全部 `*.ulg`。需要加入二进制 Fixture 时，应先移除位置和设备信息、缩短时间范围，并在代码评审中说明来源和脱敏方式。

`minimal-flight.json` 是人工生成的两帧 FlightData，用于验证 Fixture 加载流程。其余坐标、插值、播放和模式测试使用程序生成的数据，不依赖个人飞行日志。
