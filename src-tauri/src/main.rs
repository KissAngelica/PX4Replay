#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    px4_flight_replay_lib::run();
}
