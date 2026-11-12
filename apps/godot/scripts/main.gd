extends Node
## Main: owns screen switching. Milestone 1 has one screen, the Level.

const LEVEL_SCENE := preload("res://scenes/level.tscn")

func _ready() -> void:
	add_child(LEVEL_SCENE.instantiate())
