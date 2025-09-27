# Tutorials
Below are the s ections explaing how to use the Soundscape Adventure. The videos in the secions are short videos demonstrating how to use/configure the soundscapes.

All the explanations below are referent to the Soundscape Adventure for FoundryVTT V13. For the V12 please see these [Tutotials](TUTORIAL.md)

## Creating a Soundscape
When creating a new soundscape you have the option to load the sounds within a folder and its subfolders. After create a soundscape, a new json file with same name is created in the folder you selected. Also there will be a playlist named with same name of the Soundscape with the prefix "Soundscape:". That means if you create a soundscape named "Forest" a playlist will be created with the name "Soundscape: Forest". You don't need to interact direct to the playlist, hat is the way the soundscape uses to keep all sounds for the soundscape loaded in foundryvtt.

<video src="videos/Create-Soundscape.mp4"  controls></video>

## Loading a Soundscape

## Creating a Mood
When creating a mood we need to type its name. Every mood has three sounds types explained in the next section. By default the mood is created with with a category None for each sound type. The available sounds can be found in the library.
<video src="videos/Create-Mood.mp4"  controls></video>

## Sound Types
- Library: Sounds available to use in the soundscape. These sounds are the same sounds in the playlist.
- Loop: Sounds that after start playing it keeps playing until the mood stops.
- Random: Sounds that play randomly based on its configuration.
- Soundscape: Sounds to play once. Thse sounds are also available in the soundpad UI

## Moving Sounds
You can drag and drop sounds from the Library to any category type, from types and categories, and back to the library.

<video src="videos/Move-Sounds.mp4"  controls></video>

## Preview Sound
You can play the sounds in the Library to listen to the sound before move it.
<video src="videos/Preview-Sound.mp4"  controls></video>

## General Sound Configurations
Configure sounds involves defining its ovlume, its state (enable or disable) and other parameters in the sound settings.

### Basic Options
The basic configuration for sounds are: Set the volume, define if the sound is enabled or disabled for that mood. All basic configuration applied to a sound is defined for that mood and it doesn't replicate to other moods.
<video src="videos/Sound-Configuration-Basic.mp4"  controls></video>

### Config Options for type Loop sounds (Sound settings)
In the Sound Settings you can configure the sound name, triggers for that  sound, you can define a group (Group configuration will be showed in a section below), and other options.

Each configuration is exclusive to the mood, excluding the name of the sound. When changing a name of a sound in a mood, it will be reflected not only for that mood but for all moods in the soundscape.
<video src="videos/Sound-Configuration-Loop.mp4"  controls></video>

### Config Options for type Random sounds (Sound settings)
Random sounds have some different configurations. You must configure the random interval the sound needs to play.

<video src="videos/Sound-Configuration-Random.mp4"  controls></video>

## Adding new sounds to the soundscape
To add a new sound to the soundscape you need to add the sound to the playlist relatead to the soundscape. 
<video src="videos/Add-New-Sound.mp4"  controls></video>

## Categories
Sound categories are useful when you have many sounds of same type and you want to organize them. There is no silver bullet for categories, it all depends on how you want to organize the sounds. Categories have three commands to enable all sounds in the category, play all sounds enabled on that category, stop all sounds enabled in that category.

Categories with same names in different types are considered the related categories. For example, if there is a category named "Rain" in the type loop and anohter category with same name in the type random, when you click on play or stop all enabled sounds for the category "Rain"in the type loop, the enabled sounds within the Rain category otherwise will enable only sounds in one specific category despite both having same name.

This is useful when you want, for example, simulate a weather condition, or another specific situation in a scene that you want to play at same time multitple sounds from loop and random types.

### Creating Category
<video src="videos/Create-Category.mp4"  controls></video>

### Category Commands
<video src="videos/Category-Commands.mp4"  controls></video>

## Loop sounds
Loop sounds are continuosly playing when the mood is on.

### Loop Sound Group
When grouping loop sounds, a new control will be available. The intensity control allows to change the loop sound to give an intensity impresion. To make it corretly you need to name the sounds with same name an in order, for example rain1 to rain5. This way the intensity closest to 0 will play the lowest value and closer to 100% will play the rain5.

Intensities can be useful to increase the intensity of a rain to a storm or in a scene when something is getting close.
<video src="videos/Loop-Sound-Group.mp4"  controls></video>

## Random Sounds
Random sounds can be played in an interval multiple times or only once. When grouping random sounds the soundscape will play one of the sounds in the group, and in hte next execution will execute another sound without repeating the previous one.
### Random Sound Group
<video src="videos/Random-Sound-Group.mp4"  controls></video>

## Soundpad Sounds
Soundpad sounds allow the GM to play sounds quicker during a scene. There is a dedicated UI for the Soundpad sounds that GM can even add some images to the sounds to identify each one.
<video src="videos/Soundpad-Sounds.mp4"  controls></video>


## Triggers
There are many triggers that can be configured to start or stop a mood or sounds within a mood. Below examples on how to start/stop moods when activating a scene, triggering some actions related to a region, or when start/stop a combat.

There are other fine tunning options configuring specific sounds but these 3 examples below might cover 99% of the common usage of the soundscape.

### Scenes
You can configure a mood to start playing when a scene is activated. When a mood starts, if any other mood playing before will be stopped.

<video src="videos/Trigger-Scene.mp4"  controls></video>

### Regions
<video src="videos/Trigger-Region.mp4"  controls></video>

### Combat
<video src="videos/Trigger-Combat.mp4"  controls></video>