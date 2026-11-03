import React from 'react';
import {View,Text,ScrollView,TouchableOpacity,StyleSheet} from 'react-native';
import {useAuth} from '../../context/AuthContext';
import {Header,Button,Avatar,ui} from '../../components/ClinicUI';
import {demoDoctors} from '../../data/demo';
import {colors} from '../../theme/colors';
export default function HomeScreen({navigation}:any){const {user}=useAuth();const demo=true;const doctor=demoDoctors[1];return <View style={ui.page}><Header title="ClinicRDV" subtitle="Accueil"/><ScrollView contentContainerStyle={ui.content}>
 {demo&&<Text style={s.demo}>MODE DÉMONSTRATION · Données fictives</Text>}
 <Text style={s.greet}>Bonjour {user?.first_name||'Sophie'} 👋</Text><Text style={ui.muted}>Prenez soin de votre santé aujourd'hui.</Text>
 <View style={{marginTop:16}}><Button title="⊕  Prendre un nouveau rendez-vous" onPress={()=>navigation.navigate('Médecins')}/></View>
 <View style={s.heading}><Text style={ui.h2}>Prochain rendez-vous</Text><TouchableOpacity onPress={()=>navigation.navigate('Mes RDV')}><Text style={s.link}>Voir l'historique</Text></TouchableOpacity></View>
 <View style={ui.card}><View style={ui.line}><Avatar initials={doctor.initials} tint={doctor.tint}/><View style={{flex:1}}><Text style={ui.label}>{doctor.name}</Text><Text style={ui.muted}>{doctor.specialty}</Text></View><Text style={ui.badge}>Exemple</Text></View><View style={s.info}><Text style={s.infoText}>▣  Jeudi 14 novembre à 10:30</Text><Text style={s.infoText}>⌖  Cabinet médical fictif</Text></View><Text style={ui.muted}>Rendez-vous illustratif — non enregistré</Text></View>
 <View style={s.heading}><Text style={ui.h2}>Spécialités médicales</Text><TouchableOpacity onPress={()=>navigation.navigate('Médecins')}><Text style={s.link}>Toutes</Text></TouchableOpacity></View>
 <View style={s.specialties}>{[['✚','Généraliste'],['♡','Pédiatre'],['♧','Dentiste'],['♥','Cardiologie']].map(([symbol,label])=><TouchableOpacity key={label} style={s.specialty} onPress={()=>navigation.navigate('Médecins')}><Text style={s.specialIcon}>{symbol}</Text><Text style={s.specialText}>{label}</Text></TouchableOpacity>)}</View>
 <Text style={[ui.h2,ui.section]}>Médecins recommandés</Text>{demoDoctors.slice(0,2).map(d=><View style={ui.card} key={d.id}><View style={ui.line}><Avatar initials={d.initials} tint={d.tint}/><View style={{flex:1}}><Text style={ui.label}>{d.name}</Text><Text style={ui.muted}>{d.specialty}</Text><Text style={{color:'#12834C',fontSize:11,marginTop:5}}>● {d.available}</Text></View><TouchableOpacity onPress={()=>navigation.navigate('SlotPicker',{doctor:d})}><Text style={s.link}>Réserver →</Text></TouchableOpacity></View></View>)}
 </ScrollView></View>}
const s=StyleSheet.create({demo:{color:'#936200',backgroundColor:'#FFF4CF',padding:9,borderRadius:9,marginBottom:12,fontSize:11,textAlign:'center'},greet:{fontSize:23,fontWeight:'900',color:colors.text},heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:25,marginBottom:8},link:{color:colors.primary,fontWeight:'700',fontSize:12},info:{backgroundColor:'#F0F5FF',padding:12,borderRadius:10,marginVertical:12},infoText:{color:'#334B70',fontSize:12,marginVertical:3},specialties:{flexDirection:'row',justifyContent:'space-between'},specialty:{backgroundColor:'#fff',borderRadius:14,alignItems:'center',paddingVertical:14,width:'23%',borderWidth:1,borderColor:'#EEF1F7'},specialIcon:{fontSize:24,color:colors.primary},specialText:{fontSize:10,color:colors.text,marginTop:7,fontWeight:'700'}});

