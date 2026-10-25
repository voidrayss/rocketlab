// RocketLab-authored optional external benchmark driver. No OpenRocket implementation is copied.
// Reflective public API calls keep this utility compilable with JDK 11; run on OpenRocket's Java 17.
import java.lang.reflect.*;
public class Reference {
 static Object make(String cls) throws Exception {return Class.forName(cls).getConstructor().newInstance();}
 static Object call(Object obj,String name,Object...args) throws Exception {
  Class<?> type=obj instanceof Class?(Class<?>)obj:obj.getClass();
  for(Method m:type.getMethods()) if(m.getName().equals(name)&&m.getParameterCount()==args.length){
   Class<?>[] types=m.getParameterTypes();boolean ok=true;
   for(int i=0;i<types.length;i++){Class<?> t=types[i];if(t==double.class)t=Double.class;else if(t==int.class)t=Integer.class;else if(t==boolean.class)t=Boolean.class;if(args[i]!=null&&!t.isInstance(args[i]))ok=false;}
   if(ok)return m.invoke(obj instanceof Class?null:obj,args);
  }throw new NoSuchMethodException(type+"."+name);
 }
 @SuppressWarnings({"rawtypes","unchecked"}) static Object en(String cls,String value)throws Exception{return Enum.valueOf((Class)Class.forName(cls),value);}
 static double x(Object c)throws Exception{return c.getClass().getField("x").getDouble(c);}
 static Object material(String name,double density)throws Exception{return call(Class.forName("info.openrocket.core.material.Material"),"newMaterial",en("info.openrocket.core.material.Material$Type","BULK"),name,density,false);}
 public static void main(String[]args)throws Exception{
  System.setProperty("java.awt.headless","true");System.setProperty("openrocket.bypass.presets","true");System.setProperty("openrocket.bypass.motors","true");
  call(Class.forName("info.openrocket.core.startup.OpenRocketCore"),"initialize");
  for(String shape:new String[]{"CONICAL","OGIVE"}){
   Object rocket=make("info.openrocket.core.rocketcomponent.Rocket"),stage=make("info.openrocket.core.rocketcomponent.AxialStage"),nose=make("info.openrocket.core.rocketcomponent.NoseCone"),body=make("info.openrocket.core.rocketcomponent.BodyTube"),fins=make("info.openrocket.core.rocketcomponent.TrapezoidFinSet");
   call(rocket,"addChild",stage);call(stage,"addChild",nose);call(stage,"addChild",body);call(body,"addChild",fins);
   call(nose,"setShapeType",en("info.openrocket.core.rocketcomponent.Transition$Shape",shape));
   call(nose,"setLength",.15);call(nose,"setBaseRadiusAutomatic",false);call(nose,"setBaseRadius",.025);call(nose,"setThickness",.002);call(nose,"setFilled",false);call(nose,"setShoulderLength",0.0);call(nose,"setMaterial",material("RocketLab plastic",1200.0));
   call(body,"setLength",.35);call(body,"setOuterRadiusAutomatic",false);call(body,"setOuterRadius",.025);call(body,"setThickness",.001);call(body,"setMaterial",material("RocketLab cardboard",680.0));
   call(fins,"setCrossSection",en("info.openrocket.core.rocketcomponent.FinSet$CrossSection","SQUARE"));call(fins,"setFinCount",3);call(fins,"setRootChord",.08);call(fins,"setTipChord",.04);call(fins,"setHeight",.05);call(fins,"setSweep",.04);call(fins,"setThickness",.003);call(fins,"setFilletRadius",0.0);call(fins,"setMaterial",material("RocketLab plywood",600.0));
   call(fins,"setAxialMethod",en("info.openrocket.core.rocketcomponent.position.AxialMethod","BOTTOM"));call(fins,"setAxialOffset",0.0);
   call(nose,"setAxialMethod",en("info.openrocket.core.rocketcomponent.position.AxialMethod","TOP"));call(nose,"setAxialOffset",0.0);
   call(body,"setAxialMethod",en("info.openrocket.core.rocketcomponent.position.AxialMethod","AFTER"));call(body,"setAxialOffset",0.0);
   call(rocket,"enableEvents");call(rocket,"update");
   System.out.println("POSITIONS nose="+call(nose,"getPosition")+" body="+call(body,"getPosition")+" fins="+call(fins,"getPosition"));
   Object config=call(rocket,"getSelectedConfiguration");
   Object cond=Class.forName("info.openrocket.core.aerodynamics.FlightConditions").getConstructors()[0].newInstance(config);call(cond,"setMach",.1);call(cond,"setAOA",0.0);Object atmosphere=call(cond,"getAtmosphericConditions");call(atmosphere,"setTemperature",288.15);call(atmosphere,"setPressure",101325.0);
   Object warnings=make("info.openrocket.core.logging.WarningSet"),calc=make("info.openrocket.core.aerodynamics.BarrowmanCalculator");
   Object cp=call(calc,"getCP",config,cond,warnings),mass=call(Class.forName("info.openrocket.core.masscalc.MassCalculator"),"calculateStructure",config);
   Object forces=call(calc,"getAerodynamicForces",config,cond,warnings);
   System.out.println("REFERENCE {\"shape\":\""+shape+"\",\"cp_m\":"+x(cp)+",\"structureMass_kg\":"+call(mass,"getMass")+",\"cg_m\":"+x(call(mass,"getCM"))+",\"finLocalCG_m\":"+x(call(fins,"getComponentCG"))+",\"finMass_kg\":"+call(fins,"getMass")+",\"noseMass_kg\":"+call(nose,"getMass")+",\"noseLocalCG_m\":"+x(call(nose,"getComponentCG"))+",\"bodyMass_kg\":"+call(body,"getMass")+",\"Cd\":"+call(forces,"getCD")+",\"finish\":\""+call(body,"getFinish")+"\",\"noseShapeParameter\":"+call(nose,"getShapeParameter")+"}");
  }System.exit(0);
 }
}
